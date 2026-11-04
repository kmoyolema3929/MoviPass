-- =====================================================================
-- Plantillas de asientos por TIPO de bus (dentro de cada cooperativa)
--
-- Qué cambia:
--   1. Una plantilla ya no es de un bus, sino de (cooperativa, tipo de bus).
--      Todos los buses de ese tipo la comparten (buses.plantilla_id).
--   2. La última fila puede tener 5 asientos (el quinto ocupa el hueco del
--      pasillo central). Se guarda con columna = 1..5.
--   3. Un usuario con rol "cooperativa" solo ve datos de SU cooperativa
--      (buses, frecuencias, hojas de ruta, paradas, viajes). Antes las
--      políticas de lectura pública dejaban ver todo.
--   4. La vista "asientos" se mantiene (calculada) para no romper la
--      pantalla de selección de asientos.
--
-- Las tablas antiguas NO se borran: quedan como *_antiguo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Retirar el modelo "una plantilla por bus"
-- ---------------------------------------------------------------------
drop function if exists public.guardar_plantilla_asientos(uuid, jsonb, timestamptz);

alter table public.asientos rename to asientos_antiguo;
alter table public.plantillas_asientos rename to plantillas_asientos_antiguo;

-- ---------------------------------------------------------------------
-- 2. Plantillas por tipo de bus
-- ---------------------------------------------------------------------
create table public.plantillas_bus (
    id uuid primary key default gen_random_uuid(),
    cooperativa_id uuid not null
        references public.cooperativas (id) on delete cascade,
    tipo_bus varchar not null
        check (length(trim(tipo_bus)) > 0),
    numero_pisos smallint not null
        check (numero_pisos in (1, 2)),
    total_asientos smallint not null
        check (total_asientos between 1 and 60),
    distribucion jsonb not null,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint plantillas_bus_capacidad_check
        check (numero_pisos = 1 or total_asientos between 40 and 60),
    constraint plantillas_bus_distribucion_check
        check (
            jsonb_typeof(distribucion) = 'array'
            and jsonb_array_length(distribucion) = numero_pisos
        )
);

-- Un solo tipo por cooperativa, sin distinguir mayúsculas ni espacios.
create unique index plantillas_bus_tipo_unico
    on public.plantillas_bus (cooperativa_id, lower(trim(tipo_bus)));

create table public.plantilla_asientos (
    plantilla_id uuid not null
        references public.plantillas_bus (id) on delete cascade,
    numero smallint not null check (numero between 1 and 60),
    piso smallint not null check (piso in (1, 2)),
    fila smallint not null check (fila between 1 and 60),
    -- 1..4 normal; 5 solo en una última fila de 5 asientos.
    columna smallint not null check (columna between 1 and 5),
    tipo text not null check (tipo in ('normal', 'vip')),
    primary key (plantilla_id, numero),
    unique (plantilla_id, piso, fila, columna),
    constraint plantilla_asientos_piso_superior_normal_check
        check (piso = 1 or tipo = 'normal')
);

alter table public.buses
    add column plantilla_id uuid
        references public.plantillas_bus (id) on delete set null;

create index buses_plantilla_id_idx on public.buses (plantilla_id);

-- ---------------------------------------------------------------------
-- 3. Funciones auxiliares
-- ---------------------------------------------------------------------

-- ¿El bus pertenece a una cooperativa asignada al usuario actual?
-- SECURITY DEFINER para no disparar las políticas de "buses" (evita
-- recursión entre políticas).
create or replace function public.es_mi_bus(p_bus_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.buses as b
        join public.cooperativas_usuarios as cu
            on cu.cooperativa_id = b.cooperativa_id
        where b.id = p_bus_id
          and cu.perfil_id = (select auth.uid())
    );
$$;

-- Los buses nuevos (o los que cambian de tipo) toman la plantilla de su
-- cooperativa y tipo, si existe.
create or replace function public.asignar_plantilla_a_bus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    select pb.id
      into new.plantilla_id
    from public.plantillas_bus as pb
    where pb.cooperativa_id = new.cooperativa_id
      and lower(trim(pb.tipo_bus)) = lower(trim(new.tipo_bus));

    return new;
end;
$$;

create trigger buses_asignar_plantilla
    before insert or update of tipo_bus, cooperativa_id
    on public.buses
    for each row
    execute function public.asignar_plantilla_a_bus();

-- Guardar (crear o actualizar) la plantilla de un tipo y asignarla a
-- todos los buses de ese tipo en la cooperativa.
create or replace function public.guardar_plantilla_bus(
    p_cooperativa_id uuid,
    p_tipo_bus text,
    p_distribucion jsonb,
    p_actualizado_en_esperado timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_usuario uuid := auth.uid();
    v_rol text := public.rol_actual();
    v_tipo text := trim(coalesce(p_tipo_bus, ''));
    v_numero_pisos int;
    v_indice int;
    v_piso jsonb;
    v_campo text;
    v_valor numeric;
    v_limite int;
    v_cantidad int;
    v_filas int;
    v_columnas int;
    v_central boolean;
    v_total int := 0;
    v_desplazamiento int := 0;
    v_tipo_asiento text;
    v_distribucion jsonb := '[]'::jsonb;
    v_ahora timestamptz;
    v_plantilla public.plantillas_bus%rowtype;
    v_cambio boolean := true;
    v_buses int;
begin
    -- 1. Sesión, rol y cooperativa.
    if v_usuario is null
       or v_rol is null
       or v_rol not in ('administrador', 'cooperativa') then
        raise exception 'No tienes permiso para guardar plantillas.'
            using errcode = '42501';
    end if;

    if v_rol = 'cooperativa'
       and not public.es_de_mi_cooperativa(p_cooperativa_id) then
        raise exception 'La cooperativa no está disponible para esta cuenta.'
            using errcode = '42501';
    end if;

    if p_cooperativa_id is null
       or not exists (
           select 1 from public.cooperativas as c
           where c.id = p_cooperativa_id
       ) then
        raise exception 'La cooperativa no existe.'
            using errcode = '22023';
    end if;

    if length(v_tipo) = 0 or length(v_tipo) > 60 then
        raise exception 'Indica el tipo de bus (máximo 60 caracteres).'
            using errcode = '22023';
    end if;

    -- 2. Validar la distribución.
    if jsonb_typeof(p_distribucion) is distinct from 'array' then
        raise exception 'La distribución debe ser una lista de pisos.'
            using errcode = '22023';
    end if;

    v_numero_pisos := jsonb_array_length(p_distribucion);

    if v_numero_pisos not in (1, 2) then
        raise exception 'El bus debe tener uno o dos pisos.'
            using errcode = '22023';
    end if;

    for v_indice in 0..(v_numero_pisos - 1) loop
        v_piso := p_distribucion -> v_indice;

        if jsonb_typeof(v_piso) is distinct from 'object' then
            raise exception 'La configuración del piso % no es válida.',
                v_indice + 1
                using errcode = '22023';
        end if;

        foreach v_campo in array array['cantidad', 'filas', 'columnas']
        loop
            if jsonb_typeof(v_piso -> v_campo) is distinct from 'number' then
                raise exception 'El campo % del piso % debe ser numérico.',
                    v_campo, v_indice + 1
                    using errcode = '22023';
            end if;

            v_valor := (v_piso ->> v_campo)::numeric;
            v_limite := case when v_campo = 'columnas' then 4 else 60 end;

            if v_valor <> trunc(v_valor)
               or v_valor < 1
               or v_valor > v_limite then
                raise exception
                    'El campo % del piso % debe ser un entero entre 1 y %.',
                    v_campo, v_indice + 1, v_limite
                    using errcode = '22023';
            end if;
        end loop;

        if (v_piso -> 'ultima_fila_5') is not null
           and jsonb_typeof(v_piso -> 'ultima_fila_5') <> 'boolean' then
            raise exception 'El campo ultima_fila_5 del piso % debe ser verdadero o falso.',
                v_indice + 1
                using errcode = '22023';
        end if;

        v_cantidad := (v_piso ->> 'cantidad')::numeric::integer;
        v_filas := (v_piso ->> 'filas')::numeric::integer;
        v_columnas := (v_piso ->> 'columnas')::numeric::integer;
        v_central := coalesce((v_piso ->> 'ultima_fila_5')::boolean, false);

        if v_central then
            -- Filas de 4 asientos y una última fila de 5:
            -- cantidad = 4 × (filas - 1) + 5 = 4 × filas + 1.
            if v_columnas <> 4
               or v_cantidad < 5
               or (v_cantidad - 1) % 4 <> 0
               or v_filas <> (v_cantidad - 1) / 4 then
                raise exception
                    'La última fila de 5 asientos (piso %) requiere 4 asientos por fila y una cantidad de 5, 9, 13... (4 × filas + 1).',
                    v_indice + 1
                    using errcode = '22023';
            end if;
        elsif v_filas <> (v_cantidad + v_columnas - 1) / v_columnas then
            raise exception
                'Las filas del piso % no corresponden a su cantidad de asientos y columnas.',
                v_indice + 1
                using errcode = '22023';
        end if;

        v_total := v_total + v_cantidad;

        v_distribucion := v_distribucion || jsonb_build_array(
            jsonb_build_object(
                'numero', v_indice + 1,
                'cantidad', v_cantidad,
                'filas', v_filas,
                'columnas', v_columnas,
                'ultima_fila_5', v_central
            )
        );
    end loop;

    if v_total > 60
       or (v_numero_pisos = 2 and v_total < 40) then
        raise exception
            'Capacidad inválida: máximo 60 asientos; en dos pisos, entre 40 y 60.'
            using errcode = '22023';
    end if;

    -- 3. Buscar la plantilla de ese tipo y bloquearla.
    select pb.*
      into v_plantilla
    from public.plantillas_bus as pb
    where pb.cooperativa_id = p_cooperativa_id
      and lower(trim(pb.tipo_bus)) = lower(v_tipo)
    for update;

    if found then
        if p_actualizado_en_esperado is null
           or v_plantilla.actualizado_en
              is distinct from p_actualizado_en_esperado then
            raise exception
                'La plantilla cambió desde que la abriste. Vuelve a cargarla antes de guardar.'
                using errcode = '40001';
        end if;

        -- Si la distribución no cambió, se conservan los asientos.
        v_cambio := not (
            v_plantilla.numero_pisos = v_numero_pisos
            and v_plantilla.total_asientos = v_total
            and v_plantilla.distribucion = v_distribucion
        );

        if v_cambio or v_plantilla.tipo_bus <> v_tipo then
            v_ahora := clock_timestamp();

            if v_ahora <= v_plantilla.actualizado_en then
                v_ahora := v_plantilla.actualizado_en + interval '1 microsecond';
            end if;

            update public.plantillas_bus as pb
            set tipo_bus = v_tipo,
                numero_pisos = v_numero_pisos,
                total_asientos = v_total,
                distribucion = v_distribucion,
                actualizado_en = v_ahora
            where pb.id = v_plantilla.id
            returning pb.* into v_plantilla;
        end if;
    else
        if p_actualizado_en_esperado is not null then
            raise exception
                'La plantilla anterior ya no existe. Vuelve a cargar el tipo de bus.'
                using errcode = '40001';
        end if;

        insert into public.plantillas_bus (
            cooperativa_id,
            tipo_bus,
            numero_pisos,
            total_asientos,
            distribucion,
            actualizado_en
        )
        values (
            p_cooperativa_id,
            v_tipo,
            v_numero_pisos,
            v_total,
            v_distribucion,
            clock_timestamp()
        )
        returning * into v_plantilla;
    end if;

    -- 4. Regenerar los asientos de la plantilla.
    if v_cambio then
        delete from public.plantilla_asientos as pa
        where pa.plantilla_id = v_plantilla.id;

        for v_indice in 0..(v_numero_pisos - 1) loop
            v_piso := v_distribucion -> v_indice;
            v_cantidad := (v_piso ->> 'cantidad')::integer;
            v_filas := (v_piso ->> 'filas')::integer;
            v_columnas := (v_piso ->> 'columnas')::integer;
            v_central := (v_piso ->> 'ultima_fila_5')::boolean;

            v_tipo_asiento := case
                when v_numero_pisos = 2 and v_indice = 0 then 'vip'
                else 'normal'
            end;

            insert into public.plantilla_asientos (
                plantilla_id, numero, piso, fila, columna, tipo
            )
            select
                v_plantilla.id,
                v_desplazamiento + s.pos,
                v_indice + 1,
                case
                    when v_central and s.pos > (v_filas - 1) * 4
                        then v_filas
                    else ((s.pos - 1) / v_columnas) + 1
                end,
                case
                    when v_central and s.pos > (v_filas - 1) * 4
                        then s.pos - (v_filas - 1) * 4
                    else ((s.pos - 1) % v_columnas) + 1
                end,
                v_tipo_asiento
            from pg_catalog.generate_series(1, v_cantidad) as s(pos);

            v_desplazamiento := v_desplazamiento + v_cantidad;
        end loop;
    end if;

    -- 5. Asignar la plantilla a todos los buses de ese tipo.
    update public.buses as b
    set plantilla_id = v_plantilla.id
    where b.cooperativa_id = p_cooperativa_id
      and lower(trim(b.tipo_bus)) = lower(v_tipo)
      and b.plantilla_id is distinct from v_plantilla.id;

    select count(*)
      into v_buses
    from public.buses as b
    where b.plantilla_id = v_plantilla.id;

    return to_jsonb(v_plantilla)
        || jsonb_build_object('buses_asignados', v_buses);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Seguridad (RLS)
-- ---------------------------------------------------------------------
alter table public.plantillas_bus enable row level security;
alter table public.plantilla_asientos enable row level security;

-- Cooperativa: solo sus plantillas. Admin y roles de venta: todas.
create policy "lectura de plantillas por tipo"
    on public.plantillas_bus
    for select
    to authenticated
    using (
        (select public.rol_actual()) in
            ('administrador', 'oficinista', 'cliente', 'bus')
        or (
            (select public.rol_actual()) = 'cooperativa'
            and public.es_de_mi_cooperativa(cooperativa_id)
        )
    );

-- Hereda lo que permita la política de plantillas_bus.
create policy "lectura de asientos de plantilla"
    on public.plantilla_asientos
    for select
    to authenticated
    using (
        exists (
            select 1
            from public.plantillas_bus as p
            where p.id = plantilla_asientos.plantilla_id
        )
    );

-- Sin políticas de escritura: las plantillas solo se modifican con
-- guardar_plantilla_bus().

-- Cooperativa NO debe ver buses, rutas ni viajes de otras cooperativas.
-- Las políticas de "lectura pública" se mantienen para clientes,
-- oficinistas, choferes y visitantes, pero excluyen a la cooperativa
-- (que ya tiene sus propias políticas o la función es_mi_bus()).

drop policy if exists "busqueda consulta buses con viajes" on public.buses;
create policy "busqueda consulta buses con viajes"
    on public.buses
    for select
    to anon, authenticated
    using (
        exists (select 1 from public.viajes as v where v.bus_id = buses.id)
        and (select public.rol_actual()) is distinct from 'cooperativa'
    );

drop policy if exists "busqueda consulta cooperativas con viajes"
    on public.cooperativas;
create policy "busqueda consulta cooperativas con viajes"
    on public.cooperativas
    for select
    to anon, authenticated
    using (
        exists (
            select 1
            from public.buses as b
            join public.viajes as v on v.bus_id = b.id
            where b.cooperativa_id = cooperativas.id
        )
        and (select public.rol_actual()) is distinct from 'cooperativa'
    );

drop policy if exists "Permitir lectura publica de frecuencias"
    on public.frecuencias;
create policy "Permitir lectura publica de frecuencias"
    on public.frecuencias
    for select
    to public
    using (
        (select public.rol_actual()) is distinct from 'cooperativa'
        or public.es_de_mi_cooperativa(cooperativa_id)
    );

drop policy if exists "Permitir lectura publica de hojas_ruta"
    on public.hojas_ruta;
create policy "Permitir lectura publica de hojas_ruta"
    on public.hojas_ruta
    for select
    to public
    using (
        (select public.rol_actual()) is distinct from 'cooperativa'
        or public.es_mi_bus(bus_id)
    );

drop policy if exists "Permitir lectura publica de paradas"
    on public.paradas;
create policy "Permitir lectura publica de paradas"
    on public.paradas
    for select
    to public
    using (
        (select public.rol_actual()) is distinct from 'cooperativa'
        or public.puede_gestionar_frecuencia(frecuencia_id)
    );

drop policy if exists "consulta publica de viajes" on public.viajes;
create policy "consulta publica de viajes"
    on public.viajes
    for select
    to anon, authenticated
    using (
        (select public.rol_actual()) is distinct from 'cooperativa'
        or public.es_mi_bus(bus_id)
    );

-- ---------------------------------------------------------------------
-- 5. Vista "asientos" (compatibilidad con la selección de asientos)
--    Cada bus muestra los asientos de su plantilla.
-- ---------------------------------------------------------------------
create view public.asientos
with (security_invoker = true) as
select
    md5(b.id::text || ':' || pa.numero::text)::uuid as id,
    b.id as bus_id,
    pa.numero,
    pa.piso,
    pa.fila,
    pa.columna,
    pa.tipo
from public.buses as b
join public.plantilla_asientos as pa
    on pa.plantilla_id = b.plantilla_id;

grant select on public.asientos to authenticated;

-- Refrescar la caché de esquema de la API.
notify pgrst, 'reload schema';

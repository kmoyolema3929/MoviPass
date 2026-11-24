-- =====================================================================
-- Cambio 7, parte 7.1: frecuencias aprobadas
--
-- Qué cambia:
--   1. cantones.ciudad: cabecera cantonal cuando su nombre es distinto del
--      cantón (Pastaza -> Puyo, Morona -> Macas, Lago Agrio -> Nueva Loja...).
--      cantones.etiqueta: el nombre que se muestra en pantallas y búsqueda:
--        - con la ciudad si es distinta: "Pastaza (Puyo)" (los pasajeros
--          buscan por ciudad);
--        - con la provincia si dos cantones quedarían iguales:
--          "Olmedo (Loja)" y "Olmedo (Manabí)";
--        - si no, solo el nombre: "Ambato".
--      Se recalcula sola si cambia el catálogo.
--   2. frecuencias: origen_canton_id y destino_canton_id (catálogo, sin texto
--      libre), grupo_id (grupo de bus) y orden_hoja_ruta (orden de las filas de
--      la hoja de ruta; vacío = por hora de salida).
--      origen y destino (texto) se MANTIENEN como copia del nombre del cantón
--      ("Pastaza (Puyo)"), con un disparador, porque la búsqueda del cliente y
--      la venta los usan (igual que tipo_bus en el cambio 6).
--   3. Migración: el texto de cada frecuencia se enlaza con su cantón por
--      nombre o por ciudad, sin distinguir mayúsculas ni tildes; si no hay
--      exactamente un cantón, queda sin enlazar y la pantalla la marca "por
--      corregir". El grupo se toma de los buses que tuvo en la hoja de ruta.
--   4. paradas: canton_id (opcional; si el lugar no está en la lista se
--      escribe) y orden. Siguen con su hora estimada.
--   5. guardar_frecuencia (frecuencia + paradas juntas), eliminar_frecuencia
--      (solo sin boletos ni compras; si tiene, sugiere desactivarla) y
--      ordenar_frecuencias (subir y bajar en la hoja de ruta).
--   6. Eliminar un grupo de bus ya revisa sus frecuencias: motivo_grupo_bus_en_uso
--      (cambio 6) las cuenta en cuanto existe frecuencias.grupo_id.
-- Parte de la base en la nube (cambio7-base-nube.txt).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Ciudad cabecera de los cantones (solo cuando es distinta del nombre)
-- ---------------------------------------------------------------------
alter table public.cantones add column if not exists ciudad varchar(80);

update public.cantones as c
set ciudad = v.ciudad
from (values
    (203, 'San José de Chimbo'),
    (403, 'El Ángel'),
    (405, 'San Gabriel'),
    (406, 'Huaca'),
    (503, 'El Corazón'),
    (505, 'San Miguel de Salcedo'),
    (603, 'Villa La Unión'),
    (703, 'Paccha'),
    (714, 'La Victoria'),
    (802, 'Valdez'),
    (804, 'Rosa Zárate'),
    (902, 'Jujan'),
    (908, 'Velasco Ibarra'),
    (920, 'Yaguachi'),
    (921, 'General Villamil'),
    (925, 'Narcisa de Jesús'),
    (927, 'Bucay'),
    (1002, 'Atuntaqui'),
    (1006, 'Urcuquí'),
    (1102, 'Cariamanga'),
    (1106, 'Amaluza'),
    (1109, 'Catacocha'),
    (1110, 'Alamor'),
    (1206, 'Catarama'),
    (1302, 'Calceta'),
    (1314, 'Bahía de Caráquez'),
    (1316, 'Sucre'),
    (1401, 'Macas'),
    (1403, 'Limón'),
    (1405, 'Méndez'),
    (1412, 'Santiago'),
    (1507, 'Baeza'),
    (1601, 'Puyo'),
    (1703, 'Machachi'),
    (1704, 'Tabacundo'),
    (1705, 'Sangolquí'),
    (1802, 'Baños'),
    (1807, 'Pelileo'),
    (1808, 'Píllaro'),
    (1902, 'Zumba'),
    (1903, 'Guayzimi'),
    (1904, '28 de Mayo'),
    (1907, 'Zumbi'),
    (2001, 'Puerto Baquerizo Moreno'),
    (2002, 'Puerto Villamil'),
    (2003, 'Puerto Ayora'),
    (2101, 'Nueva Loja'),
    (2102, 'Lumbaqui'),
    (2103, 'Puerto El Carmen de Putumayo'),
    (2105, 'La Bonita'),
    (2106, 'El Dorado de Cascales'),
    (2107, 'Tarapoa'),
    (2201, 'El Coca'),
    (2202, 'Nuevo Rocafuerte')
) as v(id, ciudad)
where c.id = v.id
  and c.ciudad is distinct from v.ciudad;

-- "Pastaza (Puyo)"; "Ambato" si la ciudad se llama igual.
create or replace function public.etiqueta_canton(p_nombre text, p_ciudad text)
returns text
language sql
immutable
set search_path to ''
as $function$
    select case
        when p_ciudad is null or btrim(p_ciudad) = '' or lower(btrim(p_ciudad)) = lower(btrim(p_nombre))
            then btrim(p_nombre)
        else btrim(p_nombre) || ' (' || btrim(p_ciudad) || ')'
    end;
$function$;

-- Texto para comparar: sin mayúsculas, tildes ni espacios sobrantes.
create or replace function public.texto_comparable(p_texto text)
returns text
language sql
immutable
set search_path to ''
as $function$
    select pg_catalog.regexp_replace(
        translate(lower(btrim(coalesce(p_texto, ''))), 'áéíóúüñ', 'aeiouun'),
        '\s+', ' ', 'g'
    );
$function$;

-- Nombre para mostrar de todos los cantones (ver arriba).
alter table public.cantones add column if not exists etiqueta varchar(140);

create or replace function public.recalcular_etiquetas_cantones()
returns void
language sql
security definer
set search_path to ''
as $function$
    with base as (
        select c.id, c.provincia_id, public.etiqueta_canton(c.nombre, c.ciudad) as etiqueta
        from public.cantones as c
    ),
    calculada as (
        select b.id,
               case
                   when count(*) over (partition by lower(b.etiqueta)) > 1
                       then b.etiqueta || ' (' || p.nombre || ')'
                   else b.etiqueta
               end as etiqueta
        from base as b
        join public.provincias as p on p.id = b.provincia_id
    )
    update public.cantones as c
    set etiqueta = x.etiqueta
    from calculada as x
    where x.id = c.id
      and c.etiqueta is distinct from x.etiqueta;
$function$;

select public.recalcular_etiquetas_cantones();

create or replace function public.recalcular_etiquetas_cantones_disparador()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
    perform public.recalcular_etiquetas_cantones();
    return null;
end;
$function$;

drop trigger if exists cantones_recalcular_etiquetas on public.cantones;
create trigger cantones_recalcular_etiquetas
    after insert or update of nombre, ciudad, provincia_id or delete
    on public.cantones
    for each statement
    execute function public.recalcular_etiquetas_cantones_disparador();

-- El cantón que corresponde a un texto (por nombre, ciudad o etiqueta), o
-- null si no hay exactamente uno.
create or replace function public.canton_de_texto(p_texto text)
returns smallint
language sql
stable
set search_path to ''
as $function$
    select case when count(*) = 1 then min(c.id) end
    from public.cantones as c
    where public.texto_comparable(p_texto) in (
        public.texto_comparable(c.nombre),
        public.texto_comparable(c.ciudad),
        public.texto_comparable(c.etiqueta)
    );
$function$;

-- ---------------------------------------------------------------------
-- 2. Columnas nuevas de frecuencias y paradas
-- ---------------------------------------------------------------------
alter table public.frecuencias
    add column if not exists origen_canton_id smallint references public.cantones (id),
    add column if not exists destino_canton_id smallint references public.cantones (id),
    add column if not exists grupo_id uuid references public.grupos_bus (id) on delete restrict,
    add column if not exists orden_hoja_ruta smallint;

alter table public.frecuencias drop constraint if exists frecuencias_orden_hoja_ruta_check;
alter table public.frecuencias
    add constraint frecuencias_orden_hoja_ruta_check
        check (orden_hoja_ruta is null or orden_hoja_ruta between 1 and 999);

create index if not exists frecuencias_grupo_id_idx on public.frecuencias (grupo_id);

alter table public.paradas
    add column if not exists canton_id smallint references public.cantones (id),
    add column if not exists orden smallint;

-- ---------------------------------------------------------------------
-- 3. Migrar los datos que ya existen (antes de los disparadores)
-- ---------------------------------------------------------------------
update public.frecuencias as f
set origen_canton_id = public.canton_de_texto(f.origen)
where f.origen_canton_id is null;

update public.frecuencias as f
set destino_canton_id = public.canton_de_texto(f.destino)
where f.destino_canton_id is null;

-- Un mismo cantón en origen y destino no es válido: queda por corregir.
update public.frecuencias
set destino_canton_id = null
where destino_canton_id = origen_canton_id;

-- El texto queda como la etiqueta del cantón ("Puyo" -> "Pastaza (Puyo)").
update public.frecuencias as f
set origen = c.etiqueta
from public.cantones as c
where c.id = f.origen_canton_id
  and f.origen is distinct from c.etiqueta;

update public.frecuencias as f
set destino = c.etiqueta
from public.cantones as c
where c.id = f.destino_canton_id
  and f.destino is distinct from c.etiqueta;

-- Grupo: el de los buses que más veces hicieron esa frecuencia.
update public.frecuencias as f
set grupo_id = x.grupo_id
from (
    select distinct on (h.frecuencia_id) h.frecuencia_id, b.grupo_id
    from public.hojas_ruta as h
    join public.buses as b on b.id = h.bus_id
    join public.frecuencias as fr on fr.id = h.frecuencia_id
    join public.grupos_bus as g on g.id = b.grupo_id and g.cooperativa_id = fr.cooperativa_id
    group by h.frecuencia_id, b.grupo_id
    order by h.frecuencia_id, count(*) desc, b.grupo_id
) as x
where x.frecuencia_id = f.id
  and f.grupo_id is null;

-- Paradas: orden por hora y cantón si el nombre coincide con uno.
with ordenadas as (
    select p.id, row_number() over (partition by p.frecuencia_id order by p.hora_estimada, p.id) as orden
    from public.paradas as p
)
update public.paradas as p
set orden = o.orden
from ordenadas as o
where o.id = p.id
  and p.orden is null;

update public.paradas as p
set canton_id = public.canton_de_texto(p.nombre)
where p.canton_id is null;

update public.paradas as p
set nombre = c.etiqueta
from public.cantones as c
where c.id = p.canton_id;

alter table public.paradas alter column orden set not null;

-- ---------------------------------------------------------------------
-- 4. Reglas de frecuencias (validación en la base)
-- ---------------------------------------------------------------------
create or replace function public.validar_frecuencia()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_canton public.cantones%rowtype;
begin
    if tg_op = 'INSERT' and new.cooperativa_id is null then
        raise exception 'Elige la cooperativa de la frecuencia.' using errcode = '23502';
    end if;

    -- Origen y destino: obligatorios en las nuevas; no se pueden quitar.
    -- Las frecuencias migradas sin cantón siguen funcionando hasta que se corrijan.
    if new.origen_canton_id is null and (tg_op = 'INSERT' or old.origen_canton_id is not null) then
        raise exception 'Elige el cantón de origen.' using errcode = '23502';
    end if;

    if new.destino_canton_id is null and (tg_op = 'INSERT' or old.destino_canton_id is not null) then
        raise exception 'Elige el cantón de destino.' using errcode = '23502';
    end if;

    if new.origen_canton_id = new.destino_canton_id then
        raise exception 'El origen y el destino no pueden ser el mismo cantón.' using errcode = '23514';
    end if;

    -- El texto que usa la búsqueda es la etiqueta del cantón.
    if new.origen_canton_id is not null then
        select c.* into v_canton from public.cantones as c where c.id = new.origen_canton_id;
        new.origen := v_canton.etiqueta;
    end if;

    if new.destino_canton_id is not null then
        select c.* into v_canton from public.cantones as c where c.id = new.destino_canton_id;
        new.destino := v_canton.etiqueta;
    end if;

    -- Grupo de bus: obligatorio en las nuevas y de la misma cooperativa.
    if new.grupo_id is null and (tg_op = 'INSERT' or old.grupo_id is not null) then
        raise exception 'Elige el grupo de bus de la frecuencia.' using errcode = '23502';
    end if;

    if new.grupo_id is not null and not exists (
        select 1 from public.grupos_bus as g
        where g.id = new.grupo_id and g.cooperativa_id = new.cooperativa_id
    ) then
        raise exception 'El grupo de bus no pertenece a la cooperativa de la frecuencia.' using errcode = '23503';
    end if;

    new.numero_resolucion := btrim(new.numero_resolucion);

    if length(new.numero_resolucion) = 0 or length(new.numero_resolucion) > 60 then
        raise exception 'Escribe el número de resolución de la ANT (máximo 60 caracteres).' using errcode = '23514';
    end if;

    if new.hora is null then
        raise exception 'Escribe la hora de salida.' using errcode = '23502';
    end if;

    return new;
end;
$function$;

drop trigger if exists frecuencias_validar on public.frecuencias;
create trigger frecuencias_validar
    before insert or update
    on public.frecuencias
    for each row
    execute function public.validar_frecuencia();

-- Paradas: nombre del cantón o escrito, y su orden.
create or replace function public.validar_parada()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_canton public.cantones%rowtype;
begin
    if new.canton_id is not null then
        select c.* into v_canton from public.cantones as c where c.id = new.canton_id;
        if not found then
            raise exception 'El cantón de la parada no existe.' using errcode = '23503';
        end if;
        new.nombre := v_canton.etiqueta;
    end if;

    new.nombre := pg_catalog.regexp_replace(btrim(coalesce(new.nombre, '')), '\s+', ' ', 'g');

    if length(new.nombre) not between 2 and 100 then
        raise exception 'Escribe el lugar de la parada (de 2 a 100 caracteres).' using errcode = '23514';
    end if;

    if new.hora_estimada is null then
        raise exception 'Escribe la hora estimada de la parada %.', new.nombre using errcode = '23502';
    end if;

    if new.orden is null then
        select coalesce(max(p.orden), 0) + 1 into new.orden
        from public.paradas as p
        where p.frecuencia_id = new.frecuencia_id;
    end if;

    return new;
end;
$function$;

drop trigger if exists paradas_validar on public.paradas;
create trigger paradas_validar
    before insert or update
    on public.paradas
    for each row
    execute function public.validar_parada();

-- ---------------------------------------------------------------------
-- 5. ¿Puede el usuario gestionar las frecuencias de la cooperativa?
-- ---------------------------------------------------------------------
create or replace function public.exigir_gestor_de_frecuencias(p_cooperativa_id uuid)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
    if public.rol_actual() is distinct from 'administrador'
       and not (public.rol_actual() = 'cooperativa' and public.es_de_mi_cooperativa(p_cooperativa_id)) then
        raise exception 'No tienes permiso para gestionar las frecuencias de esta cooperativa.'
            using errcode = '42501';
    end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- 6. Guardar una frecuencia con sus paradas (todo o nada)
--    p_datos: { origen_canton_id, destino_canton_id, hora, precio_base,
--               numero_resolucion, grupo_id, activa, tipo }
--    p_paradas: [{ canton_id | nombre, hora_estimada }] en orden
-- ---------------------------------------------------------------------
create or replace function public.guardar_frecuencia(
    p_cooperativa_id uuid,
    p_frecuencia_id bigint,
    p_datos jsonb,
    p_paradas jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_id bigint := p_frecuencia_id;
    v_tipo text := coalesce(p_datos ->> 'tipo', 'directa');
    v_paradas jsonb := coalesce(p_paradas, '[]'::jsonb);
    v_parada jsonb;
    v_orden int := 0;
    v_lugares text[] := '{}';
    v_lugar text;
    v_origen smallint := nullif(p_datos ->> 'origen_canton_id', '')::smallint;
    v_destino smallint := nullif(p_datos ->> 'destino_canton_id', '')::smallint;
begin
    perform public.exigir_gestor_de_frecuencias(p_cooperativa_id);

    if v_tipo not in ('directa', 'compartida') then
        raise exception 'Elige el tipo: directa o con paradas.' using errcode = '23514';
    end if;

    if jsonb_typeof(v_paradas) <> 'array' then
        raise exception 'Las paradas no son válidas.' using errcode = '22023';
    end if;

    if v_tipo = 'directa' and jsonb_array_length(v_paradas) > 0 then
        raise exception 'Una frecuencia directa no tiene paradas.' using errcode = '23514';
    end if;

    if v_tipo = 'compartida' and jsonb_array_length(v_paradas) = 0 then
        raise exception 'Agrega al menos una parada a la frecuencia con paradas.' using errcode = '23514';
    end if;

    if jsonb_typeof(p_datos -> 'precio_base') is distinct from 'number'
       or (p_datos ->> 'precio_base')::numeric < 0 then
        raise exception 'Escribe un precio base válido (0 o más).' using errcode = '23514';
    end if;

    -- Paradas: lugar sin repetir y distinto del origen y del destino.
    for v_parada in select e.value from jsonb_array_elements(v_paradas) as e loop
        v_lugar := case
            when nullif(v_parada ->> 'canton_id', '') is not null then 'c' || (v_parada ->> 'canton_id')
            else 't' || public.texto_comparable(v_parada ->> 'nombre')
        end;

        if v_lugar in ('c' || v_origen, 'c' || v_destino) then
            raise exception 'Una parada no puede ser el origen ni el destino de la frecuencia.' using errcode = '23514';
        end if;

        if v_lugar = any (v_lugares) then
            raise exception 'Hay una parada repetida.' using errcode = '23514';
        end if;

        v_lugares := v_lugares || v_lugar;
    end loop;

    if v_id is null then
        insert into public.frecuencias (
            cooperativa_id, origen, destino, origen_canton_id, destino_canton_id, hora,
            precio_base, numero_resolucion, grupo_id, activa, tipo
        )
        values (
            p_cooperativa_id, '', '', v_origen, v_destino, (p_datos ->> 'hora')::time,
            (p_datos ->> 'precio_base')::numeric, coalesce(p_datos ->> 'numero_resolucion', ''),
            nullif(p_datos ->> 'grupo_id', '')::uuid, coalesce((p_datos ->> 'activa')::boolean, true), v_tipo
        )
        returning id into v_id;
    else
        perform 1
        from public.frecuencias as f
        where f.id = v_id and f.cooperativa_id = p_cooperativa_id
        for update;

        if not found then
            raise exception 'La frecuencia ya no existe. Recarga la página.' using errcode = '40001';
        end if;

        -- Las paradas se reemplazan (primero se quitan para poder cambiar el tipo).
        delete from public.paradas as p where p.frecuencia_id = v_id;

        update public.frecuencias
        set origen_canton_id = v_origen,
            destino_canton_id = v_destino,
            hora = (p_datos ->> 'hora')::time,
            precio_base = (p_datos ->> 'precio_base')::numeric,
            numero_resolucion = coalesce(p_datos ->> 'numero_resolucion', ''),
            grupo_id = nullif(p_datos ->> 'grupo_id', '')::uuid,
            activa = coalesce((p_datos ->> 'activa')::boolean, true),
            tipo = v_tipo
        where id = v_id;
    end if;

    for v_parada in select e.value from jsonb_array_elements(v_paradas) as e loop
        v_orden := v_orden + 1;

        insert into public.paradas (frecuencia_id, canton_id, nombre, hora_estimada, orden)
        values (
            v_id,
            nullif(v_parada ->> 'canton_id', '')::smallint,
            coalesce(v_parada ->> 'nombre', ''),
            nullif(v_parada ->> 'hora_estimada', '')::time,
            v_orden
        );
    end loop;

    return v_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- 7. Eliminar una frecuencia: solo sin boletos ni compras
-- ---------------------------------------------------------------------
create or replace function public.eliminar_frecuencia(p_frecuencia_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_cooperativa uuid;
    v_boletos int;
    v_compras int;
begin
    select f.cooperativa_id into v_cooperativa
    from public.frecuencias as f
    where f.id = p_frecuencia_id
    for update;

    if not found then
        raise exception 'La frecuencia ya no existe. Recarga la página.' using errcode = '40001';
    end if;

    perform public.exigir_gestor_de_frecuencias(v_cooperativa);

    select count(*) into v_boletos
    from public.boletos as bo
    join public.viajes as v on v.id = bo.viaje_id
    where v.frecuencia_id = p_frecuencia_id;

    select count(*) into v_compras
    from public.compras as c
    join public.viajes as v on v.id = c.viaje_id
    where v.frecuencia_id = p_frecuencia_id;

    if v_boletos > 0 or v_compras > 0 then
        raise exception '%',
            'No se puede eliminar: la frecuencia tiene ' ||
            case
                when v_boletos = 1 then '1 boleto vendido'
                when v_boletos > 1 then v_boletos || ' boletos vendidos'
                else v_compras || case when v_compras = 1 then ' compra registrada' else ' compras registradas' end
            end ||
            '. Desactívala para que ya no se venda.'
            using errcode = '23503';
    end if;

    -- Sin ventas: se borran sus hojas de ruta (con sus viajes) y sus viajes sueltos.
    delete from public.hojas_ruta as h where h.frecuencia_id = p_frecuencia_id;
    delete from public.viajes as v where v.frecuencia_id = p_frecuencia_id;
    delete from public.frecuencias as f where f.id = p_frecuencia_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- 8. Orden de las frecuencias de un grupo en la hoja de ruta
--    p_ids: todas las frecuencias del grupo, en el orden deseado.
-- ---------------------------------------------------------------------
create or replace function public.ordenar_frecuencias(p_grupo_id uuid, p_ids bigint[])
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_cooperativa uuid;
begin
    select g.cooperativa_id into v_cooperativa
    from public.grupos_bus as g
    where g.id = p_grupo_id;

    if not found then
        raise exception 'El grupo de bus ya no existe. Recarga la página.' using errcode = '40001';
    end if;

    perform public.exigir_gestor_de_frecuencias(v_cooperativa);

    if exists (
        select 1 from unnest(p_ids) as i(id)
        where not exists (select 1 from public.frecuencias as f where f.id = i.id and f.grupo_id = p_grupo_id)
    ) then
        raise exception 'Alguna frecuencia ya no pertenece a ese grupo. Recarga la página.' using errcode = '40001';
    end if;

    update public.frecuencias as f
    set orden_hoja_ruta = o.posicion
    from unnest(p_ids) with ordinality as o(id, posicion)
    where f.id = o.id;
end;
$function$;

-- Permisos
do $$
declare
    v_funcion text;
begin
    foreach v_funcion in array array[
        'public.guardar_frecuencia(uuid, bigint, jsonb, jsonb)',
        'public.eliminar_frecuencia(bigint)',
        'public.ordenar_frecuencias(uuid, bigint[])',
        'public.exigir_gestor_de_frecuencias(uuid)'
    ]
    loop
        execute format('revoke all on function %s from public, anon', v_funcion);
        execute format('grant execute on function %s to authenticated', v_funcion);
    end loop;

    foreach v_funcion in array array['public.validar_frecuencia()', 'public.validar_parada()'] loop
        execute format('revoke all on function %s from public, anon, authenticated', v_funcion);
    end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;

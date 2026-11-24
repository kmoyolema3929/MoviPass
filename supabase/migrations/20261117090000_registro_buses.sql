-- =====================================================================
-- Cambio 6, parte 3: registro de buses
--
-- Qué cambia en public.buses:
--   - numero_interno (obligatorio, no se repite en la cooperativa, máx. 10).
--     Los buses que ya existían reciben uno provisional (1, 2, 3... por
--     cooperativa, en orden de registro) marcado con
--     numero_interno_provisional = true; deja de ser provisional cuando el
--     gerente lo cambia.
--   - dueno: dueño o socio (obligatorio). Los buses que ya existían quedan
--     con "Por registrar".
--   - marca_carroceria_id (obligatoria, catálogo marcas_carroceria) y
--     marca_carroceria_otra (obligatoria solo si la marca es "Otro").
--     Los buses que ya existían toman la marca del catálogo si su carrocería
--     coincide; si no, "Otro" con el texto que tenían.
--     La columna carroceria se mantiene con el nombre de la marca para que
--     los reportes sigan funcionando.
--   - marca_chasis_id y marca_chasis_otra (opcionales; "Otro" exige texto).
--   - chasis (número de chasis) pasa a ser opcional.
--   - foto_ruta: ruta de la foto en el bucket "fotos-buses" (opcional).
--   - usuario_bus_id: usuario con rol 'bus' de la misma cooperativa (opcional).
--   - plantilla_id: obligatoria en los buses nuevos y no se puede quitar.
--     Cambiarla sigue pasando por la protección de boletos (parte 2).
--   Cambiar el grupo no cambia la plantilla (ya era así desde la parte 2).
--
-- Storage: bucket nuevo "fotos-buses", público para leer (el cliente verá
-- la foto sin iniciar sesión), solo imágenes JPG, PNG o WebP de hasta 2 MB.
-- Subir, cambiar y borrar: solo el gerente de la cooperativa dueña (la
-- carpeta de la foto es el id de la cooperativa). El bucket "comprobantes"
-- no se toca.
--
-- Nueva función obtener_usuarios_bus_de_cooperativa para el combo
-- "Usuario bus asignado".
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas
-- ---------------------------------------------------------------------
alter table public.buses
    add column if not exists numero_interno varchar(10),
    add column if not exists numero_interno_provisional boolean not null default false,
    add column if not exists dueno varchar(120),
    add column if not exists marca_carroceria_id integer references public.marcas_carroceria (id),
    add column if not exists marca_carroceria_otra varchar(60),
    add column if not exists marca_chasis_id integer references public.marcas_chasis (id),
    add column if not exists marca_chasis_otra varchar(60),
    add column if not exists foto_ruta text,
    add column if not exists usuario_bus_id uuid references public.perfiles (id) on delete set null;

-- El número de chasis ahora es opcional.
alter table public.buses alter column chasis drop not null;

create index if not exists buses_usuario_bus_id_idx on public.buses (usuario_bus_id);

-- ---------------------------------------------------------------------
-- 2. Datos de los buses que ya existían
-- ---------------------------------------------------------------------
with numerados as (
    select b.id,
           row_number() over (partition by b.cooperativa_id order by b.creado_en, b.placa) as orden
    from public.buses as b
    where b.numero_interno is null
)
update public.buses as b
set numero_interno = n.orden::text,
    numero_interno_provisional = true
from numerados as n
where n.id = b.id;

update public.buses
set dueno = 'Por registrar'
where dueno is null;

-- Marca de carrocería: la del catálogo si coincide; si no, "Otro" + el texto.
update public.buses as b
set marca_carroceria_id = m.id
from public.marcas_carroceria as m
where b.marca_carroceria_id is null
  and lower(btrim(m.nombre)) = lower(btrim(b.carroceria))
  and lower(m.nombre) <> 'otro';

update public.buses as b
set marca_carroceria_id = (select m.id from public.marcas_carroceria as m where lower(m.nombre) = 'otro'),
    marca_carroceria_otra = left(btrim(b.carroceria), 60)
where b.marca_carroceria_id is null;

do $$
begin
    if exists (select 1 from public.buses where marca_carroceria_id is null) then
        raise exception 'Falta la marca «Otro» en marcas_carroceria. No se aplicó ningún cambio.';
    end if;
end;
$$;

alter table public.buses
    alter column numero_interno set not null,
    alter column dueno set not null,
    alter column marca_carroceria_id set not null;

-- ---------------------------------------------------------------------
-- 3. Reglas (también se revisan en pantalla)
-- ---------------------------------------------------------------------
alter table public.buses drop constraint if exists buses_numero_interno_check;
alter table public.buses
    add constraint buses_numero_interno_check
        check (numero_interno = btrim(numero_interno) and length(numero_interno) between 1 and 10);

alter table public.buses drop constraint if exists buses_dueno_check;
alter table public.buses
    add constraint buses_dueno_check
        check (dueno = btrim(dueno) and length(dueno) between 2 and 120);

alter table public.buses drop constraint if exists buses_marcas_otra_check;
alter table public.buses
    add constraint buses_marcas_otra_check
        check (
            (marca_carroceria_otra is null or length(btrim(marca_carroceria_otra)) between 1 and 60)
            and (marca_chasis_otra is null or length(btrim(marca_chasis_otra)) between 1 and 60)
        );

create unique index if not exists buses_numero_interno_unico
    on public.buses (cooperativa_id, lower(numero_interno));

-- Reglas que necesitan consultar otras tablas.
create or replace function public.validar_bus()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_marca text;
begin
    -- Número interno: sin espacios sobrantes y en mayúsculas. Deja de ser
    -- provisional cuando se cambia.
    new.numero_interno := upper(pg_catalog.regexp_replace(btrim(coalesce(new.numero_interno, '')), '\s+', ' ', 'g'));

    if new.numero_interno = '' then
        raise exception 'Escribe el número interno del bus.' using errcode = '23502';
    end if;

    if tg_op = 'INSERT' then
        new.numero_interno_provisional := false;
    elsif new.numero_interno is distinct from old.numero_interno then
        new.numero_interno_provisional := false;
    end if;

    -- Dueño o socio.
    new.dueno := pg_catalog.regexp_replace(btrim(coalesce(new.dueno, '')), '\s+', ' ', 'g');

    if length(new.dueno) < 2 then
        raise exception 'Escribe el dueño o socio del bus.' using errcode = '23502';
    end if;

    -- Marca de carrocería (obligatoria; "Otro" exige el texto).
    select m.nombre into v_marca
    from public.marcas_carroceria as m
    where m.id = new.marca_carroceria_id;

    if not found then
        raise exception 'Elige la marca de carrocería.' using errcode = '23502';
    end if;

    new.marca_carroceria_otra := nullif(btrim(coalesce(new.marca_carroceria_otra, '')), '');

    if lower(v_marca) = 'otro' then
        if new.marca_carroceria_otra is null then
            raise exception 'Escribe la marca de carrocería.' using errcode = '23502';
        end if;
    else
        new.marca_carroceria_otra := null;
    end if;

    -- La columna anterior conserva el nombre de la marca (reportes).
    new.carroceria := coalesce(new.marca_carroceria_otra, v_marca);

    -- Marca de chasis (opcional; "Otro" exige el texto).
    new.marca_chasis_otra := nullif(btrim(coalesce(new.marca_chasis_otra, '')), '');

    if new.marca_chasis_id is null then
        new.marca_chasis_otra := null;
    else
        select m.nombre into v_marca
        from public.marcas_chasis as m
        where m.id = new.marca_chasis_id;

        if not found then
            raise exception 'La marca de chasis no existe.' using errcode = '23503';
        end if;

        if lower(v_marca) = 'otro' then
            if new.marca_chasis_otra is null then
                raise exception 'Escribe la marca de chasis.' using errcode = '23502';
            end if;
        else
            new.marca_chasis_otra := null;
        end if;
    end if;

    -- Número de chasis (opcional).
    new.chasis := nullif(btrim(coalesce(new.chasis, '')), '');

    -- Plantilla: obligatoria en un bus nuevo y no se puede quitar.
    if new.plantilla_id is null
       and (tg_op = 'INSERT' or old.plantilla_id is not null) then
        raise exception 'Elige la plantilla de asientos del bus.' using errcode = '23502';
    end if;

    -- Usuario bus: rol 'bus' y de la misma cooperativa.
    if new.usuario_bus_id is not null
       and (tg_op = 'INSERT'
            or new.usuario_bus_id is distinct from old.usuario_bus_id
            or new.cooperativa_id is distinct from old.cooperativa_id)
       and not exists (
           select 1
           from public.perfiles as p
           join public.cooperativas_usuarios as cu
               on cu.perfil_id = p.id
              and cu.cooperativa_id = new.cooperativa_id
           where p.id = new.usuario_bus_id
             and p.rol = 'bus'
       ) then
        raise exception 'El usuario bus elegido no pertenece a la cooperativa.' using errcode = '23503';
    end if;

    -- Foto: dentro de la carpeta de la cooperativa del bus.
    new.foto_ruta := nullif(btrim(coalesce(new.foto_ruta, '')), '');

    if new.foto_ruta is not null
       and new.foto_ruta not like new.cooperativa_id::text || '/%' then
        raise exception 'La foto no pertenece a la cooperativa del bus.' using errcode = '42501';
    end if;

    return new;
end;
$function$;

-- Se ejecuta después de buses_1_sincronizar_grupo y buses_asignar_plantilla
-- (orden alfabético), así ya están el grupo y la plantilla por defecto.
drop trigger if exists buses_validar on public.buses;
create trigger buses_validar
    before insert or update
    on public.buses
    for each row
    execute function public.validar_bus();

-- ---------------------------------------------------------------------
-- 4. Usuarios bus de una cooperativa (combo "Usuario bus asignado")
-- ---------------------------------------------------------------------
create or replace function public.obtener_usuarios_bus_de_cooperativa(p_cooperativa_id uuid)
returns table (id uuid, nombres text, apellidos text, cedula text, estado text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
    if public.rol_actual() is distinct from 'administrador'
       and not (
           public.rol_actual() = 'cooperativa'
           and public.es_de_mi_cooperativa(p_cooperativa_id)
       ) then
        raise exception 'No tienes permiso para ver este personal.'
            using errcode = '42501';
    end if;

    return query
    select p.id, p.nombres::text, p.apellidos::text, p.cedula::text, p.estado::text
    from public.perfiles as p
    join public.cooperativas_usuarios as cu on cu.perfil_id = p.id
    where cu.cooperativa_id = p_cooperativa_id
      and p.rol = 'bus'
    order by p.apellidos, p.nombres;
end;
$function$;

revoke all on function public.obtener_usuarios_bus_de_cooperativa(uuid) from public, anon;
grant execute on function public.obtener_usuarios_bus_de_cooperativa(uuid) to authenticated;
revoke all on function public.validar_bus() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Fotos de buses en Storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-buses', 'fotos-buses', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- La primera carpeta de la ruta es el id de la cooperativa:
--   <cooperativa_id>/<bus_id>-<fecha>.jpg
-- Leer: el bucket es público (URL pública, sin iniciar sesión). La política
-- de lectura solo sirve para que el gerente pueda reemplazar o borrar.
drop policy if exists "fotos-buses gerente lee" on storage.objects;
create policy "fotos-buses gerente lee"
    on storage.objects
    for select
    to authenticated
    using (
        bucket_id = 'fotos-buses'
        and (select public.rol_actual()) = 'cooperativa'
        and exists (
            select 1
            from public.cooperativas_usuarios as cu
            where cu.perfil_id = (select auth.uid())
              and cu.cooperativa_id::text = (storage.foldername(name))[1]
        )
    );

drop policy if exists "fotos-buses gerente sube" on storage.objects;
create policy "fotos-buses gerente sube"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'fotos-buses'
        and (select public.rol_actual()) = 'cooperativa'
        and exists (
            select 1
            from public.cooperativas_usuarios as cu
            where cu.perfil_id = (select auth.uid())
              and cu.cooperativa_id::text = (storage.foldername(name))[1]
        )
    );

drop policy if exists "fotos-buses gerente cambia" on storage.objects;
create policy "fotos-buses gerente cambia"
    on storage.objects
    for update
    to authenticated
    using (
        bucket_id = 'fotos-buses'
        and (select public.rol_actual()) = 'cooperativa'
        and exists (
            select 1
            from public.cooperativas_usuarios as cu
            where cu.perfil_id = (select auth.uid())
              and cu.cooperativa_id::text = (storage.foldername(name))[1]
        )
    )
    with check (
        bucket_id = 'fotos-buses'
        and (select public.rol_actual()) = 'cooperativa'
        and exists (
            select 1
            from public.cooperativas_usuarios as cu
            where cu.perfil_id = (select auth.uid())
              and cu.cooperativa_id::text = (storage.foldername(name))[1]
        )
    );

drop policy if exists "fotos-buses gerente borra" on storage.objects;
create policy "fotos-buses gerente borra"
    on storage.objects
    for delete
    to authenticated
    using (
        bucket_id = 'fotos-buses'
        and (select public.rol_actual()) = 'cooperativa'
        and exists (
            select 1
            from public.cooperativas_usuarios as cu
            where cu.perfil_id = (select auth.uid())
              and cu.cooperativa_id::text = (storage.foldername(name))[1]
        )
    );

notify pgrst, 'reload schema';

commit;

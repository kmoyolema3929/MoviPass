-- =====================================================================
-- Cambio 6, parte 1: grupos de bus
--
-- Qué cambia:
--   1. Tabla grupos_bus: cada cooperativa crea sus grupos (por ejemplo
--      "Cómodos (importados)", "Provinciales", "Rancheras"). El nombre no
--      se repite dentro de la cooperativa (sin distinguir mayúsculas).
--   2. buses.grupo_id (obligatorio). Cada tipo_bus distinto que ya existía
--      pasa a ser un grupo de su cooperativa y cada bus queda en su grupo.
--      También se crea un grupo por cada plantilla por tipo que aún no
--      tenía buses, para que ninguna plantilla quede sin grupo.
--   3. buses.tipo_bus se MANTIENE como copia del nombre del grupo, con
--      disparadores, para que la búsqueda, el filtro por tipo, la hoja de
--      ruta, la venta y las plantillas sigan funcionando igual hasta los
--      cambios 7 y 1:
--        - al guardar un bus, tipo_bus toma el nombre de su grupo;
--        - si una pantalla antigua envía solo tipo_bus, se busca el grupo
--          con ese nombre;
--        - al renombrar un grupo se renombran sus buses y la plantilla
--          por tipo de ese nombre (así los buses conservan su plantilla).
--   4. No se puede eliminar un grupo en uso (buses; y frecuencias cuando
--      el cambio 7 agregue frecuencias.grupo_id).
--
-- Parte de la base en la nube (cambio6-base-nube.txt):
--   asignar_plantilla_a_bus busca primero la plantilla propia del bus
--   (plantillas_bus.bus_id) y luego la del tipo (bus_id is null).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Tabla grupos_bus
-- ---------------------------------------------------------------------
create table if not exists public.grupos_bus (
    id uuid primary key default gen_random_uuid(),
    cooperativa_id uuid not null
        references public.cooperativas (id) on delete cascade,
    -- Igual que buses.tipo_bus (varchar(40)), porque se copia allí.
    nombre varchar(40) not null,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    constraint grupos_bus_nombre_check
        check (nombre = btrim(nombre) and length(nombre) between 1 and 40)
);

create unique index if not exists grupos_bus_nombre_unico
    on public.grupos_bus (cooperativa_id, lower(nombre));

alter table public.buses
    add column if not exists grupo_id uuid
        references public.grupos_bus (id) on delete restrict;

create index if not exists buses_grupo_id_idx on public.buses (grupo_id);

-- ---------------------------------------------------------------------
-- 2. Migrar los datos que ya existen (antes de crear los disparadores)
-- ---------------------------------------------------------------------

-- Un grupo por cada tipo distinto de cada cooperativa. Si el mismo tipo
-- está escrito con otras mayúsculas o espacios, queda un solo grupo con
-- la forma que usan los buses (y si hay varias, la primera en orden).
insert into public.grupos_bus (cooperativa_id, nombre)
select distinct on (t.cooperativa_id, lower(t.nombre))
       t.cooperativa_id, t.nombre
from (
    select b.cooperativa_id, btrim(b.tipo_bus) as nombre, 0 as prioridad
    from public.buses as b
    union all
    -- Plantillas por tipo sin buses (las plantillas propias de un bus no
    -- crean grupo: llevan el tipo de su bus).
    select pb.cooperativa_id, btrim(pb.tipo_bus), 1
    from public.plantillas_bus as pb
    where pb.bus_id is null
      and length(btrim(pb.tipo_bus)) between 1 and 40
) as t
order by t.cooperativa_id, lower(t.nombre), t.prioridad, t.nombre
on conflict do nothing;

-- Cada bus queda en el grupo de su tipo.
update public.buses as b
set grupo_id = g.id
from public.grupos_bus as g
where b.grupo_id is null
  and g.cooperativa_id = b.cooperativa_id
  and lower(g.nombre) = lower(btrim(b.tipo_bus));

-- tipo_bus queda escrito igual que el nombre del grupo. El disparador
-- buses_asignar_plantilla vuelve a buscar la plantilla sin distinguir
-- mayúsculas ni espacios, así que cada bus conserva la suya.
update public.buses as b
set tipo_bus = g.nombre
from public.grupos_bus as g
where g.id = b.grupo_id
  and b.tipo_bus is distinct from g.nombre;

do $$
begin
    if exists (select 1 from public.buses where grupo_id is null) then
        raise exception 'Hay buses sin grupo después de migrar. No se aplicó ningún cambio.';
    end if;
end;
$$;

alter table public.buses alter column grupo_id set not null;

-- ---------------------------------------------------------------------
-- 3. ¿El grupo está en uso? Devuelve el motivo o null.
--    Preparado para el cambio 7: si frecuencias tiene grupo_id, también
--    se revisan las frecuencias (sin tocar esta función).
-- ---------------------------------------------------------------------
create or replace function public.motivo_grupo_bus_en_uso(p_grupo_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_cantidad bigint;
begin
    select count(*) into v_cantidad
    from public.buses as b
    where b.grupo_id = p_grupo_id;

    if v_cantidad > 0 then
        return case
            when v_cantidad = 1 then 'tiene 1 bus'
            else 'tiene ' || v_cantidad || ' buses'
        end;
    end if;

    if exists (
        select 1
        from pg_catalog.pg_attribute as a
        where a.attrelid = to_regclass('public.frecuencias')
          and a.attname = 'grupo_id'
          and not a.attisdropped
    ) then
        execute 'select count(*) from public.frecuencias where grupo_id = $1'
            into v_cantidad
            using p_grupo_id;

        if v_cantidad > 0 then
            return case
                when v_cantidad = 1 then 'tiene 1 frecuencia'
                else 'tiene ' || v_cantidad || ' frecuencias'
            end;
        end if;
    end if;

    return null;
end;
$$;

revoke all on function public.motivo_grupo_bus_en_uso(uuid) from public, anon;
grant execute on function public.motivo_grupo_bus_en_uso(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Disparadores de grupos_bus
-- ---------------------------------------------------------------------

-- Antes de guardar: nombre sin espacios sobrantes, sin cambiar de
-- cooperativa y con fecha de actualización.
create or replace function public.preparar_grupo_bus()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.nombre := pg_catalog.regexp_replace(btrim(new.nombre), '\s+', ' ', 'g');

    if length(new.nombre) = 0 then
        raise exception 'Escribe el nombre del grupo.'
            using errcode = '23514';
    end if;

    if length(new.nombre) > 40 then
        raise exception 'El nombre del grupo admite máximo 40 caracteres.'
            using errcode = '22001';
    end if;

    if tg_op = 'UPDATE' then
        if new.cooperativa_id is distinct from old.cooperativa_id then
            raise exception 'Un grupo no puede pasar a otra cooperativa.'
                using errcode = '42501';
        end if;

        new.creado_en := old.creado_en;
        new.actualizado_en := now();
    end if;

    return new;
end;
$$;

drop trigger if exists grupos_bus_preparar on public.grupos_bus;
create trigger grupos_bus_preparar
    before insert or update on public.grupos_bus
    for each row
    execute function public.preparar_grupo_bus();

-- Al renombrar: la plantilla por tipo y los buses del grupo toman el
-- nombre nuevo. SECURITY DEFINER porque el gerente no edita
-- plantillas_bus directamente (lo hace por funciones).
create or replace function public.renombrar_grupo_bus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.nombre = old.nombre then
        return new;
    end if;

    -- Otra plantilla por tipo ya usa el nombre nuevo (por ejemplo, una
    -- plantilla creada para un tipo que aún no tiene grupo).
    if lower(new.nombre) <> lower(old.nombre)
       and exists (
           select 1
           from public.plantillas_bus as pb
           where pb.cooperativa_id = new.cooperativa_id
             and pb.bus_id is null
             and lower(btrim(pb.tipo_bus)) = lower(new.nombre)
       ) then
        raise exception
            'Ya existe una plantilla de asientos para «%». Elige otro nombre para el grupo.',
            new.nombre
            using errcode = '23505';
    end if;

    -- Primero la plantilla, para que los buses la sigan encontrando.
    update public.plantillas_bus as pb
    set tipo_bus = new.nombre
    where pb.cooperativa_id = new.cooperativa_id
      and pb.bus_id is null
      and lower(btrim(pb.tipo_bus)) = lower(old.nombre);

    -- Las plantillas propias de los buses del grupo guardan su tipo.
    update public.plantillas_bus as pb
    set tipo_bus = new.nombre
    from public.buses as b
    where pb.bus_id = b.id
      and b.grupo_id = new.id;

    update public.buses as b
    set tipo_bus = new.nombre
    where b.grupo_id = new.id;

    return new;
end;
$$;

drop trigger if exists grupos_bus_renombrar on public.grupos_bus;
create trigger grupos_bus_renombrar
    after update of nombre on public.grupos_bus
    for each row
    execute function public.renombrar_grupo_bus();

-- No se elimina un grupo en uso.
create or replace function public.impedir_borrar_grupo_en_uso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_motivo text := public.motivo_grupo_bus_en_uso(old.id);
begin
    if v_motivo is not null then
        raise exception 'No se puede eliminar el grupo «%» porque %.',
            old.nombre, v_motivo
            using errcode = '23503',
                  hint = 'Cambia esos registros a otro grupo antes de eliminarlo.';
    end if;

    return old;
end;
$$;

drop trigger if exists grupos_bus_impedir_borrar on public.grupos_bus;
create trigger grupos_bus_impedir_borrar
    before delete on public.grupos_bus
    for each row
    execute function public.impedir_borrar_grupo_en_uso();

-- ---------------------------------------------------------------------
-- 5. Disparadores de buses: tipo_bus = nombre del grupo
-- ---------------------------------------------------------------------
create or replace function public.sincronizar_grupo_de_bus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_grupo public.grupos_bus%rowtype;
begin
    -- Una pantalla antigua cambió solo tipo_bus: se busca el grupo de
    -- ese nombre (lo mismo que hace un bus nuevo sin grupo).
    if tg_op = 'UPDATE'
       and new.grupo_id is not distinct from old.grupo_id
       and new.tipo_bus is distinct from old.tipo_bus then
        new.grupo_id := null;
    end if;

    if new.grupo_id is null then
        select g.id into new.grupo_id
        from public.grupos_bus as g
        where g.cooperativa_id = new.cooperativa_id
          and lower(g.nombre) = lower(btrim(coalesce(new.tipo_bus, '')));
    end if;

    if new.grupo_id is null then
        raise exception 'Elige el grupo del bus.'
            using errcode = '23502';
    end if;

    select g.* into v_grupo
    from public.grupos_bus as g
    where g.id = new.grupo_id;

    if not found or v_grupo.cooperativa_id <> new.cooperativa_id then
        raise exception 'El grupo elegido no pertenece a la cooperativa del bus.'
            using errcode = '23503';
    end if;

    new.tipo_bus := v_grupo.nombre;

    return new;
end;
$$;

-- Los disparadores BEFORE de una tabla se ejecutan en orden alfabético:
-- "buses_1_..." va antes que "buses_asignar_plantilla", así la plantilla
-- se busca con el tipo_bus ya sincronizado.
drop trigger if exists buses_1_sincronizar_grupo on public.buses;
create trigger buses_1_sincronizar_grupo
    before insert or update of grupo_id, tipo_bus, cooperativa_id
    on public.buses
    for each row
    execute function public.sincronizar_grupo_de_bus();

-- Cambiar de grupo también vuelve a buscar la plantilla (antes lo hacía
-- solo al cambiar tipo_bus). La función asignar_plantilla_a_bus no cambia.
drop trigger if exists buses_asignar_plantilla on public.buses;
create trigger buses_asignar_plantilla
    before insert or update of tipo_bus, cooperativa_id, grupo_id
    on public.buses
    for each row
    execute function public.asignar_plantilla_a_bus();

-- ---------------------------------------------------------------------
-- 6. Seguridad (RLS): lectura para quien pertenece a la cooperativa y
--    el administrador; escritura solo para su gerente y el administrador.
-- ---------------------------------------------------------------------
alter table public.grupos_bus enable row level security;

revoke all on table public.grupos_bus from anon;
grant select, insert, update, delete on table public.grupos_bus to authenticated;

drop policy if exists "grupos_bus lectura" on public.grupos_bus;
create policy "grupos_bus lectura"
    on public.grupos_bus
    for select
    to authenticated
    using (
        (select public.rol_actual()) = 'administrador'
        or public.es_de_mi_cooperativa(cooperativa_id)
    );

drop policy if exists "grupos_bus crea gerente" on public.grupos_bus;
create policy "grupos_bus crea gerente"
    on public.grupos_bus
    for insert
    to authenticated
    with check (
        (select public.rol_actual()) = 'administrador'
        or (
            (select public.rol_actual()) = 'cooperativa'
            and public.es_de_mi_cooperativa(cooperativa_id)
        )
    );

drop policy if exists "grupos_bus edita gerente" on public.grupos_bus;
create policy "grupos_bus edita gerente"
    on public.grupos_bus
    for update
    to authenticated
    using (
        (select public.rol_actual()) = 'administrador'
        or (
            (select public.rol_actual()) = 'cooperativa'
            and public.es_de_mi_cooperativa(cooperativa_id)
        )
    )
    with check (
        (select public.rol_actual()) = 'administrador'
        or (
            (select public.rol_actual()) = 'cooperativa'
            and public.es_de_mi_cooperativa(cooperativa_id)
        )
    );

drop policy if exists "grupos_bus elimina gerente" on public.grupos_bus;
create policy "grupos_bus elimina gerente"
    on public.grupos_bus
    for delete
    to authenticated
    using (
        (select public.rol_actual()) = 'administrador'
        or (
            (select public.rol_actual()) = 'cooperativa'
            and public.es_de_mi_cooperativa(cooperativa_id)
        )
    );

commit;

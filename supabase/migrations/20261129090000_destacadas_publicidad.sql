-- =====================================================================
-- Cambio 5: frecuencias destacadas y publicidad (v0.2.0)
--
-- Parte del estado de la nube descrito en cambio5-base-nube.txt.
--   1. cooperativas: cupo_destacadas y destacadas_hasta (solo el
--      administrador los cambia: las políticas de UPDATE ya lo limitan).
--      Trigger: no se puede bajar el cupo por debajo de las ya marcadas.
--   2. frecuencias: destacada. Trigger con las reglas (el oficinista puede
--      editar frecuencias, así que la regla vive en la base):
--        - marcar: solo el gerente (rol 'cooperativa') de esa cooperativa,
--          frecuencia activa, cooperativa activa, vigencia sin vencer y
--          dentro del cupo (la fila de la cooperativa se bloquea al contar);
--        - desmarcar: el gerente de la cooperativa o el administrador;
--        - si la frecuencia se desactiva, deja de estar destacada;
--        - sin petición de la API (SQL Editor, tareas internas) no se
--          revisa el rol, pero sí las reglas para marcar.
--   3. marcar_frecuencia_destacada(): devuelve usadas y cupo.
--   4. publicidad_banners + bucket "publicidad" (solo el administrador).
--   5. banners_inicio() y destacadas_inicio() para la portada.
--      Orden rotativo: cada día la lista se desplaza un puesto, así cada
--      destacada sale primera un día de cada n (frontend/js/destacadas.js
--      hace lo mismo; día 0 = 2026-01-01, fecha de Ecuador).
--   6. Se quitan TRUNCATE, TRIGGER y REFERENCES de anon y authenticated
--      sobre frecuencias y viajes.
--
-- guardar_frecuencia() no cambia: no toca destacada.
-- Se puede ejecutar dos veces. Todo en una sola transacción.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Comprobaciones previas
-- ---------------------------------------------------------------------
do $$
begin
    if to_regprocedure('public.viaje_a_la_venta(uuid)') is null
       or to_regprocedure('public.fecha_hoy_ecuador()') is null
       or to_regprocedure('public.es_de_mi_cooperativa(uuid)') is null
       or to_regprocedure('public.exigir_gestor_de_frecuencias(uuid)') is null
       or to_regprocedure('public.rol_actual()') is null then
        raise exception 'Faltan funciones de cambios anteriores (viaje_a_la_venta, fecha_hoy_ecuador, es_de_mi_cooperativa, exigir_gestor_de_frecuencias o rol_actual).';
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Cooperativas: cupo y vigencia
-- ---------------------------------------------------------------------
alter table public.cooperativas
    add column if not exists cupo_destacadas integer not null default 0,
    add column if not exists destacadas_hasta date;

alter table public.cooperativas drop constraint if exists cooperativas_cupo_destacadas_check;
alter table public.cooperativas
    add constraint cooperativas_cupo_destacadas_check check (cupo_destacadas between 0 and 999);

comment on column public.cooperativas.cupo_destacadas is 'Frecuencias que la cooperativa puede destacar en la portada (lo fija el administrador).';
comment on column public.cooperativas.destacadas_hasta is 'Último día del periodo pagado de destacadas. Vacío = sin fecha de fin.';

-- ---------------------------------------------------------------------
-- 2. Frecuencias: destacada
-- ---------------------------------------------------------------------
alter table public.frecuencias
    add column if not exists destacada boolean not null default false;

comment on column public.frecuencias.destacada is 'Sale en "Viajes destacados" de la portada. Solo la marca el gerente, dentro del cupo.';

create index if not exists frecuencias_destacadas_idx
    on public.frecuencias (cooperativa_id)
    where destacada;

-- Una petición de la API (PostgREST) siempre trae claims del JWT y el rol
-- anon o authenticated. Sin nada de eso es el SQL Editor o una tarea interna.
create or replace function public._sin_peticion_api()
returns boolean
language sql
stable
set search_path = ''
as $$
    select coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), ''), '{}')::jsonb = '{}'::jsonb
       and nullif(pg_catalog.current_setting('request.jwt.claim.role', true), '') is null
       and coalesce(pg_catalog.current_setting('role', true), 'none') not in ('anon', 'authenticated');
$$;

-- Reglas para MARCAR una frecuencia de una cooperativa (bloquea su fila).
-- La usan el trigger y marcar_frecuencia_destacada().
create or replace function public._exigir_cupo_destacada(p_cooperativa_id uuid, p_frecuencia_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_coop public.cooperativas%rowtype;
    v_usadas int;
begin
    select c.* into v_coop
    from public.cooperativas as c
    where c.id = p_cooperativa_id
    for update;

    if not found then
        raise exception 'La cooperativa de la frecuencia ya no existe. Recarga la página.' using errcode = '40001';
    end if;

    if v_coop.estado is distinct from 'activa' then
        raise exception 'La cooperativa está suspendida: no puede destacar frecuencias nuevas.' using errcode = '23514';
    end if;

    if v_coop.cupo_destacadas = 0 then
        raise exception 'Tu cupo es 0: solicita frecuencias destacadas al administrador.' using errcode = '23514';
    end if;

    if v_coop.destacadas_hasta is not null and v_coop.destacadas_hasta < public.fecha_hoy_ecuador() then
        raise exception 'Tu periodo de frecuencias destacadas venció el %: solicita la renovación al administrador.',
            pg_catalog.to_char(v_coop.destacadas_hasta, 'DD/MM/YYYY')
            using errcode = '23514';
    end if;

    select count(*) into v_usadas
    from public.frecuencias as f
    where f.cooperativa_id = p_cooperativa_id
      and f.destacada
      and f.id is distinct from p_frecuencia_id;

    if v_usadas >= v_coop.cupo_destacadas then
        raise exception 'Ya usas tus % frecuencias destacadas: desmarca una o solicita más cupo al administrador.',
            v_coop.cupo_destacadas
            using errcode = '23514';
    end if;
end;
$$;

create or replace function public.validar_destacada_frecuencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_marcando boolean;
    v_desmarcando boolean;
    v_rol text := public.rol_actual();
    v_sin_api boolean := public._sin_peticion_api();
begin
    v_marcando := new.destacada and (
        tg_op = 'INSERT'
        or not old.destacada
        or new.cooperativa_id is distinct from old.cooperativa_id
    );
    v_desmarcando := tg_op = 'UPDATE' and old.destacada and not new.destacada;

    -- Frecuencia inactiva: no puede estar destacada.
    if new.activa is not true then
        if v_marcando then
            raise exception 'Activa la frecuencia antes de destacarla.' using errcode = '23514';
        end if;
        new.destacada := false;
        return new;
    end if;

    if v_marcando then
        if not v_sin_api then
            if v_rol = 'administrador' then
                raise exception 'El administrador solo puede quitar el destacado de una frecuencia.' using errcode = '42501';
            end if;

            if v_rol is distinct from 'cooperativa' or not public.es_de_mi_cooperativa(new.cooperativa_id) then
                raise exception 'Solo el gerente de la cooperativa puede destacar sus frecuencias.' using errcode = '42501';
            end if;
        end if;

        perform public._exigir_cupo_destacada(new.cooperativa_id, new.id);
    elsif v_desmarcando and not v_sin_api then
        if v_rol is distinct from 'administrador'
           and not (v_rol = 'cooperativa' and public.es_de_mi_cooperativa(old.cooperativa_id)) then
            raise exception 'Solo el gerente de la cooperativa o el administrador pueden quitar el destacado.' using errcode = '42501';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists frecuencias_destacada on public.frecuencias;
create trigger frecuencias_destacada
    before insert or update on public.frecuencias
    for each row execute function public.validar_destacada_frecuencia();

-- No se puede bajar el cupo por debajo de las frecuencias ya marcadas.
-- El gerente bloquea la misma fila al marcar, así que no se cruzan.
create or replace function public.validar_cupo_destacadas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_usadas int;
begin
    if new.cupo_destacadas >= old.cupo_destacadas then
        return new;
    end if;

    select count(*) into v_usadas
    from public.frecuencias as f
    where f.cooperativa_id = new.id
      and f.destacada;

    if v_usadas > new.cupo_destacadas then
        raise exception 'La cooperativa tiene % frecuencias destacadas: el gerente debe desmarcar % antes de bajar el cupo a %.',
            v_usadas, v_usadas - new.cupo_destacadas, new.cupo_destacadas
            using errcode = '23514';
    end if;

    return new;
end;
$$;

drop trigger if exists cooperativas_cupo_destacadas on public.cooperativas;
create trigger cooperativas_cupo_destacadas
    before update of cupo_destacadas on public.cooperativas
    for each row execute function public.validar_cupo_destacadas();

-- ---------------------------------------------------------------------
-- 3. Marcar o desmarcar desde la pantalla
-- ---------------------------------------------------------------------
create or replace function public.marcar_frecuencia_destacada(p_frecuencia_id bigint, p_destacada boolean)
returns table (usadas integer, cupo integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_frecuencia public.frecuencias%rowtype;
begin
    if p_destacada is null then
        raise exception 'Indica si la frecuencia queda destacada o no.' using errcode = '22023';
    end if;

    select f.* into v_frecuencia
    from public.frecuencias as f
    where f.id = p_frecuencia_id
    for update;

    if not found then
        raise exception 'La frecuencia ya no existe. Recarga la página.' using errcode = '40001';
    end if;

    perform public.exigir_gestor_de_frecuencias(v_frecuencia.cooperativa_id);

    if p_destacada and not v_frecuencia.destacada then
        if public.rol_actual() = 'administrador' then
            raise exception 'El administrador solo puede quitar el destacado de una frecuencia.' using errcode = '42501';
        end if;

        if public.rol_actual() is distinct from 'cooperativa' then
            raise exception 'Solo el gerente de la cooperativa puede destacar sus frecuencias.' using errcode = '42501';
        end if;

        if not v_frecuencia.activa then
            raise exception 'Activa la frecuencia antes de destacarla.' using errcode = '23514';
        end if;

        -- Suspendida, cupo, vigencia (bloquea la cooperativa). El trigger lo repite.
        perform public._exigir_cupo_destacada(v_frecuencia.cooperativa_id, v_frecuencia.id);
    elsif not p_destacada and v_frecuencia.destacada
          and public.rol_actual() not in ('administrador', 'cooperativa') then
        raise exception 'Solo el gerente de la cooperativa o el administrador pueden quitar el destacado.' using errcode = '42501';
    end if;

    update public.frecuencias as f
    set destacada = p_destacada
    where f.id = p_frecuencia_id
      and f.destacada is distinct from p_destacada;

    return query
    select (select count(*)::int
            from public.frecuencias as f
            where f.cooperativa_id = c.id and f.destacada),
           c.cupo_destacadas
    from public.cooperativas as c
    where c.id = v_frecuencia.cooperativa_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Banners de publicidad
-- ---------------------------------------------------------------------
create table if not exists public.publicidad_banners (
    id uuid primary key default gen_random_uuid(),
    titulo varchar(120) not null,
    imagen_url text not null,
    enlace text,
    cooperativa_id uuid references public.cooperativas (id) on delete set null,
    orden smallint not null default 0,
    activo boolean not null default true,
    fecha_inicio date not null,
    fecha_fin date not null,
    creado_en timestamptz not null default now(),
    constraint publicidad_banners_titulo_check check (length(btrim(titulo)) between 3 and 120),
    constraint publicidad_banners_imagen_check check (imagen_url ~ '^https://\S+$' and length(imagen_url) <= 500),
    constraint publicidad_banners_enlace_check check (enlace is null or (enlace ~ '^https://\S+$' and length(enlace) <= 500)),
    constraint publicidad_banners_orden_check check (orden between 0 and 999),
    constraint publicidad_banners_fechas_check check (fecha_fin >= fecha_inicio)
);

comment on table public.publicidad_banners is 'Banners del carrusel de la portada. Solo el administrador los gestiona.';
comment on column public.publicidad_banners.cooperativa_id is 'Anunciante (opcional).';

alter table public.publicidad_banners enable row level security;

drop policy if exists "administrador ve banners" on public.publicidad_banners;
drop policy if exists "administrador crea banners" on public.publicidad_banners;
drop policy if exists "administrador edita banners" on public.publicidad_banners;
drop policy if exists "administrador elimina banners" on public.publicidad_banners;

create policy "administrador ve banners" on public.publicidad_banners
    for select to authenticated
    using ((select public.rol_actual()) = 'administrador');

create policy "administrador crea banners" on public.publicidad_banners
    for insert to authenticated
    with check ((select public.rol_actual()) = 'administrador');

create policy "administrador edita banners" on public.publicidad_banners
    for update to authenticated
    using ((select public.rol_actual()) = 'administrador')
    with check ((select public.rol_actual()) = 'administrador');

create policy "administrador elimina banners" on public.publicidad_banners
    for delete to authenticated
    using ((select public.rol_actual()) = 'administrador');

revoke all on public.publicidad_banners from public, anon, authenticated;
grant select, insert, update, delete on public.publicidad_banners to authenticated;

-- Bucket público (las imágenes se ven por su URL); solo el administrador escribe.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('publicidad', 'publicidad', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "publicidad administrador lee" on storage.objects;
drop policy if exists "publicidad administrador sube" on storage.objects;
drop policy if exists "publicidad administrador cambia" on storage.objects;
drop policy if exists "publicidad administrador borra" on storage.objects;

-- SELECT solo para el administrador: Storage la necesita para borrar archivos.
create policy "publicidad administrador lee" on storage.objects
    for select to authenticated
    using (bucket_id = 'publicidad' and (select public.rol_actual()) = 'administrador');

create policy "publicidad administrador sube" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'publicidad' and (select public.rol_actual()) = 'administrador');

create policy "publicidad administrador cambia" on storage.objects
    for update to authenticated
    using (bucket_id = 'publicidad' and (select public.rol_actual()) = 'administrador')
    with check (bucket_id = 'publicidad' and (select public.rol_actual()) = 'administrador');

create policy "publicidad administrador borra" on storage.objects
    for delete to authenticated
    using (bucket_id = 'publicidad' and (select public.rol_actual()) = 'administrador');

-- ---------------------------------------------------------------------
-- 5. Portada (anon y authenticated): solo campos seguros
-- ---------------------------------------------------------------------
create or replace function public.banners_inicio()
returns table (id uuid, titulo text, imagen_url text, enlace text, anunciante text)
language sql
stable
security definer
set search_path = ''
as $$
    select b.id, b.titulo::text, b.imagen_url, b.enlace, c.nombre::text
    from public.publicidad_banners as b
    left join public.cooperativas as c on c.id = b.cooperativa_id
    where b.activo
      and public.fecha_hoy_ecuador() between b.fecha_inicio and b.fecha_fin
    order by b.orden, b.creado_en, b.id;
$$;

-- Destacadas con un viaje en venta hoy o mañana. Orden rotativo: se numeran
-- por id (0..n-1) y el día d (días desde 2026-01-01) sale primera la d mod n.
create or replace function public.destacadas_inicio()
returns table (
    cooperativa text,
    origen text,
    destino text,
    hora time,
    precio_base numeric,
    fecha date,
    viaje_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
    with hoy as (
        select public.fecha_hoy_ecuador() as d
    ),
    candidatas as (
        select f.id, c.nombre, f.origen, f.destino, f.hora, f.precio_base, prox.fecha, prox.id as viaje_id
        from public.frecuencias as f
        join public.cooperativas as c on c.id = f.cooperativa_id
        cross join hoy
        join lateral (
            select v.id, v.fecha
            from public.viajes as v
            where v.frecuencia_id = f.id
              and v.fecha between hoy.d and hoy.d + 1
              and public.viaje_a_la_venta(v.id)
            order by v.fecha
            limit 1
        ) as prox on true
        where f.destacada
          and f.activa
          and c.estado = 'activa'
          and (c.destacadas_hasta is null or c.destacadas_hasta >= hoy.d)
    ),
    numeradas as (
        select cand.*,
               row_number() over (order by cand.id) - 1 as pos,
               count(*) over () as total
        from candidatas as cand
    )
    select n.nombre::text, n.origen::text, n.destino::text, n.hora, n.precio_base, n.fecha, n.viaje_id
    from numeradas as n
    cross join hoy
    order by (((n.pos - (hoy.d - date '2026-01-01')) % n.total) + n.total) % n.total;
$$;

-- ---------------------------------------------------------------------
-- 6. Permisos
-- ---------------------------------------------------------------------
revoke all on function public._sin_peticion_api() from public, anon, authenticated;
revoke all on function public._exigir_cupo_destacada(uuid, bigint) from public, anon, authenticated;
revoke all on function public.validar_destacada_frecuencia() from public, anon, authenticated;
revoke all on function public.validar_cupo_destacadas() from public, anon, authenticated;

revoke all on function public.marcar_frecuencia_destacada(bigint, boolean) from public, anon, authenticated;
grant execute on function public.marcar_frecuencia_destacada(bigint, boolean) to authenticated;

revoke all on function public.banners_inicio() from public, anon, authenticated;
revoke all on function public.destacadas_inicio() from public, anon, authenticated;
grant execute on function public.banners_inicio() to anon, authenticated;
grant execute on function public.destacadas_inicio() to anon, authenticated;

revoke truncate, trigger, references on public.frecuencias, public.viajes from anon, authenticated;

notify pgrst, 'reload schema';

commit;

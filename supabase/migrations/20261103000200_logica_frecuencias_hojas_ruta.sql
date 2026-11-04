-- Lógica de negocio de frecuencias, paradas y hojas de ruta
--
-- Qué hace:
--  1. Cada frecuencia pertenece a una cooperativa, puede estar activa o desactivada,
--     es directa o compartida, tiene número de resolución y precio base.
--  2. Una cooperativa solo gestiona SUS frecuencias y las paradas de sus frecuencias
--     (antes cualquier cooperativa podía tocar las de otra).
--  3. Solo las frecuencias compartidas pueden tener paradas.
--  4. Hoja de ruta: no se puede programar una frecuencia desactivada, ni en fecha pasada,
--     ni con un bus de otra cooperativa.
--  5. Cada hoja de ruta crea automáticamente su viaje (el que se vende), con el precio base.
--  6. No se puede borrar una frecuencia o un bus que ya tiene hojas de ruta.

begin;

-- ======================================================================
-- 1. FRECUENCIAS: columnas nuevas
-- ======================================================================
alter table public.frecuencias
  add column if not exists cooperativa_id uuid
    references public.cooperativas(id) on delete restrict,
  add column if not exists activa boolean not null default true,
  add column if not exists tipo varchar(12) not null default 'directa'
    check (tipo in ('directa', 'compartida')),
  add column if not exists numero_resolucion varchar(60),
  add column if not exists precio_base numeric(10,2) not null default 0
    check (precio_base >= 0);

create index if not exists frecuencias_cooperativa_id_idx
  on public.frecuencias (cooperativa_id);

-- Las frecuencias que ya tenían paradas pasan a ser compartidas
update public.frecuencias
set tipo = 'compartida'
where id in (select frecuencia_id from public.paradas);

-- Origen y destino distintos (NOT VALID: solo se exige a los registros nuevos)
alter table public.frecuencias
  add constraint frecuencias_origen_destino_check
  check (lower(trim(origen)) <> lower(trim(destino))) not valid;

-- ======================================================================
-- 2. Funciones auxiliares para las políticas
-- ======================================================================
create or replace function public.es_de_mi_cooperativa(p_cooperativa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cooperativas_usuarios as asignacion
    where asignacion.cooperativa_id = p_cooperativa_id
      and asignacion.perfil_id = (select auth.uid())
  );
$$;

create or replace function public.puede_gestionar_frecuencia(p_frecuencia_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.frecuencias as f
    where f.id = p_frecuencia_id
      and (
        public.rol_actual() = 'administrador'
        or (
          public.rol_actual() = 'cooperativa'
          and f.cooperativa_id is not null
          and public.es_de_mi_cooperativa(f.cooperativa_id)
        )
      )
  );
$$;

revoke execute on function public.es_de_mi_cooperativa(uuid)
  from public, anon;
revoke execute on function public.puede_gestionar_frecuencia(bigint)
  from public, anon;
grant execute on function public.es_de_mi_cooperativa(uuid) to authenticated;
grant execute on function public.puede_gestionar_frecuencia(bigint) to authenticated;

-- ======================================================================
-- 3. POLÍTICAS de frecuencias: cada cooperativa solo las suyas
-- ======================================================================
drop policy if exists "administrador y cooperativa crean frecuencias" on public.frecuencias;
drop policy if exists "administrador y cooperativa editan frecuencias" on public.frecuencias;
drop policy if exists "administrador y cooperativa eliminan frecuencias" on public.frecuencias;

create policy "crear frecuencias autorizadas"
  on public.frecuencias
  for insert
  to authenticated
  with check (
    (select public.rol_actual()) = 'administrador'
    or (
      (select public.rol_actual()) = 'cooperativa'
      and cooperativa_id is not null
      and public.es_de_mi_cooperativa(cooperativa_id)
    )
  );

create policy "editar frecuencias autorizadas"
  on public.frecuencias
  for update
  to authenticated
  using (
    (select public.rol_actual()) = 'administrador'
    or (
      (select public.rol_actual()) = 'cooperativa'
      and cooperativa_id is not null
      and public.es_de_mi_cooperativa(cooperativa_id)
    )
  )
  with check (
    (select public.rol_actual()) = 'administrador'
    or (
      (select public.rol_actual()) = 'cooperativa'
      and cooperativa_id is not null
      and public.es_de_mi_cooperativa(cooperativa_id)
    )
  );

create policy "eliminar frecuencias autorizadas"
  on public.frecuencias
  for delete
  to authenticated
  using (
    (select public.rol_actual()) = 'administrador'
    or (
      (select public.rol_actual()) = 'cooperativa'
      and cooperativa_id is not null
      and public.es_de_mi_cooperativa(cooperativa_id)
    )
  );

-- ======================================================================
-- 4. POLÍTICAS de paradas: según la cooperativa de la frecuencia
-- ======================================================================
drop policy if exists "administrador y cooperativa crean paradas" on public.paradas;
drop policy if exists "administrador y cooperativa editan paradas" on public.paradas;
drop policy if exists "administrador y cooperativa eliminan paradas" on public.paradas;

create policy "crear paradas autorizadas"
  on public.paradas
  for insert
  to authenticated
  with check (public.puede_gestionar_frecuencia(frecuencia_id));

create policy "editar paradas autorizadas"
  on public.paradas
  for update
  to authenticated
  using (public.puede_gestionar_frecuencia(frecuencia_id))
  with check (public.puede_gestionar_frecuencia(frecuencia_id));

create policy "eliminar paradas autorizadas"
  on public.paradas
  for delete
  to authenticated
  using (public.puede_gestionar_frecuencia(frecuencia_id));

-- ======================================================================
-- 5. Solo las frecuencias compartidas pueden tener paradas
-- ======================================================================
create or replace function public.validar_parada_en_compartida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.frecuencias as f
    where f.id = new.frecuencia_id
      and f.tipo = 'compartida'
  ) then
    raise exception 'Solo las frecuencias compartidas pueden tener paradas.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger paradas_solo_compartidas
  before insert or update of frecuencia_id on public.paradas
  for each row execute function public.validar_parada_en_compartida();

-- Una frecuencia con paradas no puede pasar a directa
create or replace function public.validar_cambio_tipo_frecuencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo = 'directa' and exists (
    select 1 from public.paradas as p where p.frecuencia_id = new.id
  ) then
    raise exception 'Elimina primero las paradas para convertirla en frecuencia directa.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger frecuencias_cambio_tipo
  before update of tipo on public.frecuencias
  for each row execute function public.validar_cambio_tipo_frecuencia();

-- ======================================================================
-- 6. HOJAS DE RUTA: integridad y validaciones
-- ======================================================================
-- Antes, borrar una frecuencia o un bus borraba sus hojas de ruta en silencio.
alter table public.hojas_ruta
  drop constraint if exists hojas_ruta_frecuencia_id_fkey,
  drop constraint if exists hojas_ruta_bus_id_fkey,
  add constraint hojas_ruta_frecuencia_id_fkey
    foreign key (frecuencia_id) references public.frecuencias(id) on delete restrict,
  add constraint hojas_ruta_bus_id_fkey
    foreign key (bus_id) references public.buses(id) on delete restrict,
  add constraint hojas_ruta_estado_check
    check (estado in ('Programado', 'Completado', 'Cancelado'));

create or replace function public.validar_hoja_ruta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activa boolean;
  v_coop_frecuencia uuid;
  v_coop_bus uuid;
begin
  select f.activa, f.cooperativa_id
    into v_activa, v_coop_frecuencia
  from public.frecuencias as f
  where f.id = new.frecuencia_id;

  select b.cooperativa_id
    into v_coop_bus
  from public.buses as b
  where b.id = new.bus_id;

  if tg_op = 'INSERT' then
    if new.fecha < (now() at time zone 'America/Guayaquil')::date then
      raise exception 'No se pueden crear hojas de ruta con fechas pasadas.'
        using errcode = '23514';
    end if;

    if v_activa is not true then
      raise exception 'La frecuencia está desactivada.'
        using errcode = '23514';
    end if;
  end if;

  if v_coop_frecuencia is not null
     and v_coop_frecuencia is distinct from v_coop_bus then
    raise exception 'El bus pertenece a otra cooperativa distinta a la de la frecuencia.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger hojas_ruta_validar
  before insert or update of frecuencia_id, bus_id, fecha on public.hojas_ruta
  for each row execute function public.validar_hoja_ruta();

-- ======================================================================
-- 7. Cada hoja de ruta crea su viaje (lo que el cliente busca y compra)
-- ======================================================================
alter table public.viajes
  add column if not exists hoja_ruta_id bigint unique
    references public.hojas_ruta(id) on delete cascade;

create or replace function public.crear_viaje_de_hoja_ruta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_precio numeric(10,2);
begin
  select f.precio_base
    into v_precio
  from public.frecuencias as f
  where f.id = new.frecuencia_id;

  insert into public.viajes (frecuencia_id, bus_id, fecha, precio, hoja_ruta_id)
  values (new.frecuencia_id, new.bus_id, new.fecha, coalesce(v_precio, 0), new.id);

  return new;
end;
$$;

create trigger hojas_ruta_crea_viaje
  after insert on public.hojas_ruta
  for each row execute function public.crear_viaje_de_hoja_ruta();

create or replace function public.sincronizar_viaje_de_hoja_ruta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.viajes
  set frecuencia_id = new.frecuencia_id,
      bus_id = new.bus_id,
      fecha = new.fecha
  where hoja_ruta_id = new.id;

  return new;
end;
$$;

create trigger hojas_ruta_sincroniza_viaje
  after update of frecuencia_id, bus_id, fecha on public.hojas_ruta
  for each row execute function public.sincronizar_viaje_de_hoja_ruta();

-- Las funciones de trigger no deben poder llamarse desde la API
revoke execute on function public.validar_parada_en_compartida() from public, anon, authenticated;
revoke execute on function public.validar_cambio_tipo_frecuencia() from public, anon, authenticated;
revoke execute on function public.validar_hoja_ruta() from public, anon, authenticated;
revoke execute on function public.crear_viaje_de_hoja_ruta() from public, anon, authenticated;
revoke execute on function public.sincronizar_viaje_de_hoja_ruta() from public, anon, authenticated;

commit;

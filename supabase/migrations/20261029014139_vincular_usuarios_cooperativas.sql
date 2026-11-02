-- Relación entre usuarios y cooperativas
-- Issue #30


create table public.cooperativas_usuarios (
  cooperativa_id uuid not null
    references public.cooperativas(id)
    on delete cascade,

  perfil_id uuid not null
    references public.perfiles(id)
    on delete cascade,

  creado_en timestamptz not null default now(),

  primary key (cooperativa_id, perfil_id)
);

create index cooperativas_usuarios_perfil_id_idx
  on public.cooperativas_usuarios (perfil_id);

alter table public.cooperativas_usuarios
  enable row level security;

revoke all on table public.cooperativas_usuarios
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.cooperativas_usuarios
  to authenticated;

-- El administrador ve todas las asignaciones.
-- Una cuenta de cooperativa ve solamente las suyas.
create policy "consulta de asignaciones autorizadas"
  on public.cooperativas_usuarios
  for select
  to authenticated
  using (
    (select public.rol_actual()) = 'administrador'
    or (
      (select public.rol_actual()) = 'cooperativa'
      and perfil_id = (select auth.uid())
    )
  );

-- Solo el administrador puede asignar cuentas.
create policy "administrador crea asignaciones"
  on public.cooperativas_usuarios
  for insert
  to authenticated
  with check (
    (select public.rol_actual()) = 'administrador'
  );

create policy "administrador edita asignaciones"
  on public.cooperativas_usuarios
  for update
  to authenticated
  using (
    (select public.rol_actual()) = 'administrador'
  )
  with check (
    (select public.rol_actual()) = 'administrador'
  );

create policy "administrador elimina asignaciones"
  on public.cooperativas_usuarios
  for delete
  to authenticated
  using (
    (select public.rol_actual()) = 'administrador'
  );

-- La cuenta consulta sus cooperativas asignadas.
create policy "cooperativa consulta sus cooperativas"
  on public.cooperativas
  for select
  to authenticated
  using (
    (select public.rol_actual()) = 'cooperativa'
    and exists (
      select 1
      from public.cooperativas_usuarios as asignacion
      where asignacion.cooperativa_id = cooperativas.id
        and asignacion.perfil_id = (select auth.uid())
    )
  );

-- La cuenta consulta los buses de sus cooperativas.
create policy "cooperativa consulta sus buses"
  on public.buses
  for select
  to authenticated
  using (
    (select public.rol_actual()) = 'cooperativa'
    and exists (
      select 1
      from public.cooperativas_usuarios as asignacion
      where asignacion.cooperativa_id = buses.cooperativa_id
        and asignacion.perfil_id = (select auth.uid())
    )
  );

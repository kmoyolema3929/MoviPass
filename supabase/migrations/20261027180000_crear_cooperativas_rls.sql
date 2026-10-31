-- CRUD de cooperativas
-- Issue #27

begin;

create table public.cooperativas (
  id uuid primary key default gen_random_uuid(),

  nombre varchar(120) not null
    check (length(trim(nombre)) > 0),

  ruc varchar(13) unique not null
    check (ruc ~ '^[0-9]{13}$'),

  direccion varchar(200) not null
    check (length(trim(direccion)) > 0),

  telefono varchar(20) not null
    check (length(trim(telefono)) > 0),

  creado_en timestamptz not null default now()
);

alter table public.cooperativas enable row level security;

revoke all on table public.cooperativas
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.cooperativas
  to authenticated;

grant execute on function public.rol_actual()
  to authenticated;

create policy "administrador lista cooperativas"
  on public.cooperativas
  for select
  to authenticated
  using (public.rol_actual() = 'administrador');

create policy "administrador crea cooperativas"
  on public.cooperativas
  for insert
  to authenticated
  with check (public.rol_actual() = 'administrador');

create policy "administrador edita cooperativas"
  on public.cooperativas
  for update
  to authenticated
  using (public.rol_actual() = 'administrador')
  with check (public.rol_actual() = 'administrador');

create policy "administrador elimina cooperativas"
  on public.cooperativas
  for delete
  to authenticated
  using (public.rol_actual() = 'administrador');

commit;
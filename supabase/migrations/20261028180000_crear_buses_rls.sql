-- Tabla de buses y políticas RLS
-- Issue #29

begin;

create table public.buses (
  id uuid primary key default gen_random_uuid(),

  placa varchar(12) unique not null
    check (
      length(trim(placa)) > 0
      and placa = upper(trim(placa))
    ),

  chasis varchar(50) not null
    check (length(trim(chasis)) > 0),

  carroceria varchar(80) not null
    check (length(trim(carroceria)) > 0),

  cooperativa_id uuid not null
    references public.cooperativas(id)
    on delete restrict,

  tipo_bus varchar(40) not null
    check (length(trim(tipo_bus)) > 0),

  creado_en timestamptz not null default now()
);

create index buses_cooperativa_id_idx
  on public.buses (cooperativa_id);

alter table public.buses enable row level security;

revoke all on table public.buses
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.buses to authenticated;

create policy "administrador lista buses"
  on public.buses
  for select
  to authenticated
  using ((select public.rol_actual()) = 'administrador');

create policy "administrador crea buses"
  on public.buses
  for insert
  to authenticated
  with check ((select public.rol_actual()) = 'administrador');

create policy "administrador edita buses"
  on public.buses
  for update
  to authenticated
  using ((select public.rol_actual()) = 'administrador')
  with check ((select public.rol_actual()) = 'administrador');

create policy "administrador elimina buses"
  on public.buses
  for delete
  to authenticated
  using ((select public.rol_actual()) = 'administrador');

commit;
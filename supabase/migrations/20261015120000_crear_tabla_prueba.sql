-- Migración de prueba para verificar el flujo
create table if not exists public.prueba (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  creado_en timestamptz not null default now()
);

-- RLS activado desde el inicio (regla del proyecto)
alter table public.prueba enable row level security;
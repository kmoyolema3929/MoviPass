-- Migración: crear perfiles y roles con RLS
-- Issue #7

-- 1. Tabla de perfiles vinculada a auth.users
create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  cedula text unique not null,
  nombres text not null,
  apellidos text not null,
  telefono text,
  rol text not null default 'cliente'
    check (rol in ('administrador', 'cooperativa', 'oficinista', 'cliente', 'bus')),
  creado_en timestamptz not null default now()
);

-- 2. RLS activado desde el inicio
alter table public.perfiles enable row level security;

-- 3. Trigger: crear perfil al registrarse un usuario
create or replace function public.crear_perfil_al_registrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, cedula, nombres, apellidos, telefono, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'cedula', ''),
    coalesce(new.raw_user_meta_data->>'nombres', ''),
    coalesce(new.raw_user_meta_data->>'apellidos', ''),
    new.raw_user_meta_data->>'telefono',
    'cliente'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrar();

-- 4. Función auxiliar: rol del usuario actual
create or replace function public.rol_actual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid();
$$;

-- 5. Políticas RLS

-- Usuario ve su propio perfil
create policy "usuario ve su perfil"
  on public.perfiles for select
  using (auth.uid() = id);

-- Usuario edita su propio perfil (pero NO puede cambiar su rol)
create policy "usuario edita su perfil"
  on public.perfiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and rol = (select rol from public.perfiles where id = auth.uid())
  );

-- Administrador ve todos los perfiles
create policy "administrador ve todos"
  on public.perfiles for select
  using (public.rol_actual() = 'administrador');
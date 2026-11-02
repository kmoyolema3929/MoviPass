-- Plantillas y asientos por bus
-- Issue #31

-- 1. Configuración general de cada bus
create table public.plantillas_asientos (
  id uuid primary key default gen_random_uuid(),

  bus_id uuid unique not null
    references public.buses(id)
    on delete cascade,

  numero_pisos smallint not null
    check (numero_pisos in (1, 2)),

  total_asientos smallint not null
    check (total_asientos between 1 and 60),

  distribucion jsonb not null,

  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint plantillas_asientos_capacidad_check
    check (
      numero_pisos = 1
      or total_asientos between 40 and 60
    ),

  constraint plantillas_asientos_distribucion_check
    check (
      jsonb_typeof(distribucion) = 'array'
      and jsonb_array_length(distribucion) = numero_pisos
    )
);

-- 2. Asientos individuales
create table public.asientos (
  id uuid primary key default gen_random_uuid(),

  bus_id uuid not null
    references public.buses(id)
    on delete cascade,

  numero smallint not null
    check (numero between 1 and 60),

  piso smallint not null
    check (piso in (1, 2)),

  fila smallint not null
    check (fila between 1 and 60),

  columna smallint not null
    check (columna between 1 and 4),

  tipo text not null
    check (tipo in ('normal', 'vip')),

  creado_en timestamptz not null default now(),

  constraint asientos_plantilla_fkey
    foreign key (bus_id)
    references public.plantillas_asientos(bus_id)
    on delete cascade,

  constraint asientos_numero_por_bus_unique
    unique (bus_id, numero),

  constraint asientos_posicion_por_bus_unique
    unique (bus_id, piso, fila, columna),

  constraint asientos_piso_superior_normal_check
    check (
      piso = 1
      or tipo = 'normal'
    )
);

-- 3. Seguridad por fila
alter table public.plantillas_asientos
  enable row level security;

alter table public.asientos
  enable row level security;

-- 4. Permisos de acceso
revoke all on table
  public.plantillas_asientos,
  public.asientos
from public, anon, authenticated;

grant usage on schema public to authenticated;

grant select on table
  public.plantillas_asientos,
  public.asientos
to authenticated;

-- La escritura se realizará mediante funciones RPC controladas
-- que se agregarán en el siguiente paso.

-- 5. Lectura de plantillas
-- Administrador: todas.
-- Cooperativa: solamente las de sus buses asignados.
-- Oficinista, cliente y bus: lectura según el modelo del proyecto.
create policy "lectura autorizada de plantillas"
  on public.plantillas_asientos
  for select
  to authenticated
  using (
    (select public.rol_actual()) in (
      'administrador',
      'oficinista',
      'cliente',
      'bus'
    )
    or (
      (select public.rol_actual()) = 'cooperativa'
      and exists (
        select 1
        from public.buses as b
        join public.cooperativas_usuarios as asignacion
          on asignacion.cooperativa_id = b.cooperativa_id
        where b.id = plantillas_asientos.bus_id
          and asignacion.perfil_id = (select auth.uid())
      )
    )
  );

-- 6. Lectura de asientos
create policy "lectura autorizada de asientos"
  on public.asientos
  for select
  to authenticated
  using (
    (select public.rol_actual()) in (
      'administrador',
      'oficinista',
      'cliente',
      'bus'
    )
    or (
      (select public.rol_actual()) = 'cooperativa'
      and exists (
        select 1
        from public.buses as b
        join public.cooperativas_usuarios as asignacion
          on asignacion.cooperativa_id = b.cooperativa_id
        where b.id = asientos.bus_id
          and asignacion.perfil_id = (select auth.uid())
      )
    )
  );
-- Compras, boletos y pagos
-- Base del módulo del oficinista y del flujo de compra del cliente.
--
-- Flujo (documento del profesor):
--   Efectivo (ventanilla):  oficinista vende -> compra APROBADA + boletos EMITIDOS.
--   Depósito/transferencia: cliente compra -> asientos RESERVADOS (3 horas para subir el
--                           comprobante) -> sube comprobante -> oficinista APRUEBA -> boletos
--                           EMITIDOS con código; si RECHAZA o vence, los asientos se liberan.
--
-- Toda escritura pasa por funciones (RPC) que validan rol, cooperativa, asientos y precios en
-- la base de datos. Las tablas solo se pueden LEER desde la app.
--
-- Requiere: 20261103000200 (es_de_mi_cooperativa, viajes.hoja_ruta_id) y 20261104000000.

begin;

-- ======================================================================
-- 0. Comprobaciones previas (mensajes claros si falta algo)
-- ======================================================================
do $$
begin
  if to_regprocedure('public.es_de_mi_cooperativa(uuid)') is null then
    raise exception 'Falta la migración 20261103000200 (función es_de_mi_cooperativa). Ejecútala primero.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'viajes' and column_name = 'hoja_ruta_id'
  ) then
    raise exception 'Falta la columna viajes.hoja_ruta_id (migración 20261103000200).';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'asientos' and column_name = 'bus_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'asientos' and column_name = 'numero'
  ) then
    raise exception 'public.asientos debe tener las columnas bus_id y numero. Envíame la estructura actual de asientos.';
  end if;
end;
$$;

-- ======================================================================
-- 1. Tipos de pasajero y descuentos
--    (valores de ejemplo: ajústalos con un UPDATE si tu cooperativa usa otros)
-- ======================================================================
create table public.tipos_pasajero (
  codigo varchar(20) primary key,
  nombre varchar(60) not null,
  descuento numeric(5,2) not null check (descuento between 0 and 100)
);

insert into public.tipos_pasajero (codigo, nombre, descuento) values
  ('normal', 'Adulto', 0),
  ('nino', 'Niño', 50),
  ('tercera_edad', 'Tercera edad', 50);

-- ======================================================================
-- 2. Compras y boletos
-- ======================================================================
create table public.compras (
  id uuid primary key default gen_random_uuid(),

  viaje_id uuid not null
    references public.viajes(id) on delete restrict,

  cooperativa_id uuid not null
    references public.cooperativas(id) on delete restrict,

  -- Cliente que compró desde la app (null si la venta fue en ventanilla)
  comprador_id uuid
    references public.perfiles(id) on delete set null,

  -- Oficinista que hizo la venta en ventanilla (null si compró el cliente)
  vendedor_id uuid
    references public.perfiles(id) on delete set null,

  metodo_pago varchar(15) not null
    check (metodo_pago in ('efectivo', 'deposito', 'transferencia')),

  estado varchar(25) not null
    check (estado in (
      'pendiente_comprobante',
      'pendiente_validacion',
      'aprobada',
      'rechazada',
      'vencida'
    )),

  subtotal numeric(10,2) not null check (subtotal >= 0),
  descuento numeric(10,2) not null default 0 check (descuento >= 0),
  total numeric(10,2) not null check (total >= 0),

  comprobante_ruta text,
  comprobante_subido_en timestamptz,

  -- Límite de 3 horas para subir el comprobante (se quita al subirlo)
  vence_en timestamptz,

  validado_por uuid
    references public.perfiles(id) on delete set null,
  validado_en timestamptz,
  motivo_rechazo text,

  creado_en timestamptz not null default now()
);

create index compras_cooperativa_estado_idx on public.compras (cooperativa_id, estado);
create index compras_comprador_idx on public.compras (comprador_id);
create index compras_viaje_idx on public.compras (viaje_id);

create table public.boletos (
  id uuid primary key default gen_random_uuid(),

  compra_id uuid not null
    references public.compras(id) on delete restrict,

  viaje_id uuid not null
    references public.viajes(id) on delete restrict,

  numero_asiento smallint not null
    check (numero_asiento between 1 and 60),

  pasajero_cedula varchar(10) not null
    check (pasajero_cedula ~ '^[0-9]{10}$'),
  pasajero_nombres varchar(100) not null
    check (length(trim(pasajero_nombres)) > 0),
  pasajero_apellidos varchar(100) not null
    check (length(trim(pasajero_apellidos)) > 0),

  tipo_pasajero varchar(20) not null
    references public.tipos_pasajero(codigo),

  precio numeric(10,2) not null check (precio >= 0),

  estado varchar(15) not null default 'reservado'
    check (estado in ('reservado', 'emitido', 'anulado')),

  -- Código del boleto (se genera al emitirlo; será el contenido del QR)
  codigo varchar(20) unique,

  creado_en timestamptz not null default now()
);

create index boletos_compra_idx on public.boletos (compra_id);
create index boletos_cedula_idx on public.boletos (pasajero_cedula);

-- Un asiento no se puede vender dos veces en el mismo viaje
create unique index boletos_asiento_activo_uq
  on public.boletos (viaje_id, numero_asiento)
  where estado in ('reservado', 'emitido');

-- ======================================================================
-- 3. Permisos y RLS: las tablas solo se leen; se escribe con funciones
-- ======================================================================
alter table public.tipos_pasajero enable row level security;
alter table public.compras enable row level security;
alter table public.boletos enable row level security;

revoke all on table public.tipos_pasajero, public.compras, public.boletos
  from public, anon, authenticated;

grant select on table public.tipos_pasajero, public.compras, public.boletos
  to authenticated;

create policy "lectura de tipos de pasajero"
  on public.tipos_pasajero
  for select
  to authenticated
  using (true);

-- Administrador: todo. Cliente: sus compras. Cooperativa y oficinista: las de su cooperativa.
create policy "ver compras autorizadas"
  on public.compras
  for select
  to authenticated
  using (
    (select public.rol_actual()) = 'administrador'
    or comprador_id = (select auth.uid())
    or (
      (select public.rol_actual()) in ('cooperativa', 'oficinista')
      and public.es_de_mi_cooperativa(cooperativa_id)
    )
  );

-- Quien puede ver la compra puede ver sus boletos
create policy "ver boletos de compras visibles"
  on public.boletos
  for select
  to authenticated
  using (
    exists (
      select 1 from public.compras as c
      where c.id = boletos.compra_id
    )
  );

-- ======================================================================
-- 4. Funciones internas (no se pueden llamar desde la app)
-- ======================================================================
create or replace function public._codigo_boleto()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'MP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

-- Libera los asientos de las compras que pasaron las 3 horas sin comprobante
create or replace function public.expirar_compras_vencidas()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  with vencidas as (
    update public.compras
    set estado = 'vencida'
    where estado = 'pendiente_comprobante'
      and vence_en is not null
      and vence_en < now()
    returning id
  )
  update public.boletos as b
  set estado = 'anulado'
  from vencidas as v
  where b.compra_id = v.id
    and b.estado = 'reservado';
end;
$$;

-- Comprueba que el viaje se pueda vender y lo bloquea mientras dura la operación
-- (dos ventas del mismo viaje se procesan una detrás de otra).
-- Devuelve el id de la cooperativa dueña del viaje.
create or replace function public._viaje_para_venta(p_viaje_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fecha date;
  v_hora time;
  v_cooperativa uuid;
  v_hoja bigint;
  v_activa boolean;
  v_estado_hoja text;
begin
  select v.fecha, f.hora, b.cooperativa_id, v.hoja_ruta_id, f.activa
    into v_fecha, v_hora, v_cooperativa, v_hoja, v_activa
  from public.viajes as v
  join public.frecuencias as f on f.id = v.frecuencia_id
  join public.buses as b on b.id = v.bus_id
  where v.id = p_viaje_id
  for update of v;

  if not found then
    raise exception 'El viaje no existe.';
  end if;

  if v_activa is not true then
    raise exception 'La frecuencia de este viaje está desactivada.';
  end if;

  if v_hoja is not null then
    select h.estado into v_estado_hoja
    from public.hojas_ruta as h
    where h.id = v_hoja;

    if v_estado_hoja is distinct from 'Programado' then
      raise exception 'El viaje no está disponible para la venta (estado: %).', v_estado_hoja;
    end if;
  end if;

  if (v_fecha + v_hora) < (now() at time zone 'America/Guayaquil') then
    raise exception 'Este viaje ya salió.';
  end if;

  return v_cooperativa;
end;
$$;

-- Valida los pasajeros y calcula los precios en el servidor
-- (el precio que muestre el navegador no se toma en cuenta).
-- p_pasajeros: [{numero_asiento, cedula, nombres, apellidos, tipo}, ...]
create or replace function public._preparar_pasajeros(p_viaje_id uuid, p_pasajeros jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bus uuid;
  v_precio numeric(10,2);
  v_cantidad integer;
  v_indice integer;
  v_item jsonb;
  v_asiento integer;
  v_vistos integer[] := '{}';
  v_tipo text;
  v_descuento numeric;
  v_cedula text;
  v_nombres text;
  v_apellidos text;
  v_precio_pasajero numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_resultado jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_pasajeros) is distinct from 'array' then
    raise exception 'La lista de pasajeros no es válida.';
  end if;

  v_cantidad := jsonb_array_length(p_pasajeros);

  if v_cantidad < 1 or v_cantidad > 10 then
    raise exception 'Una compra debe tener entre 1 y 10 pasajeros.';
  end if;

  select v.bus_id, v.precio
    into v_bus, v_precio
  from public.viajes as v
  where v.id = p_viaje_id;

  for v_indice in 0..(v_cantidad - 1) loop
    v_item := p_pasajeros -> v_indice;

    if jsonb_typeof(v_item) is distinct from 'object'
       or jsonb_typeof(v_item -> 'numero_asiento') is distinct from 'number' then
      raise exception 'Los datos del pasajero % no son válidos.', v_indice + 1;
    end if;

    v_asiento := (v_item ->> 'numero_asiento')::numeric::integer;

    if v_asiento = any (v_vistos) then
      raise exception 'El asiento % está repetido.', v_asiento;
    end if;
    v_vistos := v_vistos || v_asiento;

    if not exists (
      select 1 from public.asientos as a
      where a.bus_id = v_bus and a.numero = v_asiento
    ) then
      raise exception 'El asiento % no existe en este bus.', v_asiento;
    end if;

    v_tipo := coalesce(nullif(trim(v_item ->> 'tipo'), ''), 'normal');

    select t.descuento into v_descuento
    from public.tipos_pasajero as t
    where t.codigo = v_tipo;

    if not found then
      raise exception 'El tipo de pasajero del asiento % no es válido.', v_asiento;
    end if;

    v_cedula := trim(coalesce(v_item ->> 'cedula', ''));
    v_nombres := trim(coalesce(v_item ->> 'nombres', ''));
    v_apellidos := trim(coalesce(v_item ->> 'apellidos', ''));

    if v_cedula !~ '^[0-9]{10}$' then
      raise exception 'La cédula del asiento % debe tener 10 dígitos.', v_asiento;
    end if;

    if length(v_nombres) < 2 or length(v_apellidos) < 2 then
      raise exception 'Faltan los nombres o apellidos del asiento %.', v_asiento;
    end if;

    v_precio_pasajero := round(v_precio * (100 - v_descuento) / 100, 2);
    v_subtotal := v_subtotal + v_precio;
    v_total := v_total + v_precio_pasajero;

    v_resultado := v_resultado || jsonb_build_array(
      jsonb_build_object(
        'numero_asiento', v_asiento,
        'cedula', v_cedula,
        'nombres', v_nombres,
        'apellidos', v_apellidos,
        'tipo', v_tipo,
        'precio', v_precio_pasajero
      )
    );
  end loop;

  return jsonb_build_object(
    'pasajeros', v_resultado,
    'subtotal', v_subtotal,
    'total', v_total
  );
end;
$$;

-- ======================================================================
-- 5. Funciones que usa la app
-- ======================================================================

-- Asientos ocupados de un viaje (solo los números, sin datos personales).
create or replace function public.asientos_ocupados(p_viaje_id uuid)
returns smallint[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;

  perform public.expirar_compras_vencidas();

  return coalesce(
    (
      select array_agg(b.numero_asiento order by b.numero_asiento)
      from public.boletos as b
      where b.viaje_id = p_viaje_id
        and b.estado in ('reservado', 'emitido')
    ),
    '{}'::smallint[]
  );
end;
$$;

-- Venta en ventanilla con pago en efectivo (la hace el oficinista).
create or replace function public.vender_en_oficina(p_viaje_id uuid, p_pasajeros jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_cooperativa uuid;
  v_preparado jsonb;
  v_compra uuid;
  v_pasajero jsonb;
  v_boletos jsonb;
begin
  if v_usuario is null or public.rol_actual() is distinct from 'oficinista' then
    raise exception 'Solo un oficinista puede vender boletos en ventanilla.'
      using errcode = '42501';
  end if;

  perform public.expirar_compras_vencidas();

  v_cooperativa := public._viaje_para_venta(p_viaje_id);

  if not public.es_de_mi_cooperativa(v_cooperativa) then
    raise exception 'Este viaje no pertenece a tu cooperativa.'
      using errcode = '42501';
  end if;

  v_preparado := public._preparar_pasajeros(p_viaje_id, p_pasajeros);

  insert into public.compras (
    viaje_id, cooperativa_id, vendedor_id, metodo_pago, estado,
    subtotal, descuento, total, validado_por, validado_en
  )
  values (
    p_viaje_id, v_cooperativa, v_usuario, 'efectivo', 'aprobada',
    (v_preparado ->> 'subtotal')::numeric,
    (v_preparado ->> 'subtotal')::numeric - (v_preparado ->> 'total')::numeric,
    (v_preparado ->> 'total')::numeric,
    v_usuario, now()
  )
  returning id into v_compra;

  for v_pasajero in select * from jsonb_array_elements(v_preparado -> 'pasajeros')
  loop
    insert into public.boletos (
      compra_id, viaje_id, numero_asiento, pasajero_cedula, pasajero_nombres,
      pasajero_apellidos, tipo_pasajero, precio, estado, codigo
    )
    values (
      v_compra, p_viaje_id,
      (v_pasajero ->> 'numero_asiento')::smallint,
      v_pasajero ->> 'cedula',
      v_pasajero ->> 'nombres',
      v_pasajero ->> 'apellidos',
      v_pasajero ->> 'tipo',
      (v_pasajero ->> 'precio')::numeric,
      'emitido',
      public._codigo_boleto()
    );
  end loop;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'codigo', b.codigo,
             'numero_asiento', b.numero_asiento,
             'pasajero', b.pasajero_nombres || ' ' || b.pasajero_apellidos,
             'cedula', b.pasajero_cedula,
             'tipo', b.tipo_pasajero,
             'precio', b.precio
           )
           order by b.numero_asiento
         ), '[]'::jsonb)
    into v_boletos
  from public.boletos as b
  where b.compra_id = v_compra;

  return jsonb_build_object(
    'compra_id', v_compra,
    'subtotal', (v_preparado ->> 'subtotal')::numeric,
    'total', (v_preparado ->> 'total')::numeric,
    'boletos', v_boletos
  );
exception
  when unique_violation then
    raise exception 'Uno o más asientos acaban de ser ocupados. Actualiza el mapa e inténtalo de nuevo.';
end;
$$;

-- Compra del cliente con depósito o transferencia: reserva los asientos 3 horas.
create or replace function public.crear_compra_cliente(
  p_viaje_id uuid,
  p_metodo text,
  p_pasajeros jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_cooperativa uuid;
  v_preparado jsonb;
  v_compra uuid;
  v_vence timestamptz := now() + interval '3 hours';
  v_pasajero jsonb;
begin
  if v_usuario is null or public.rol_actual() is distinct from 'cliente' then
    raise exception 'Solo un cliente puede comprar desde la aplicación.'
      using errcode = '42501';
  end if;

  if p_metodo not in ('deposito', 'transferencia') then
    raise exception 'El método de pago debe ser depósito o transferencia.';
  end if;

  perform public.expirar_compras_vencidas();

  v_cooperativa := public._viaje_para_venta(p_viaje_id);
  v_preparado := public._preparar_pasajeros(p_viaje_id, p_pasajeros);

  insert into public.compras (
    viaje_id, cooperativa_id, comprador_id, metodo_pago, estado,
    subtotal, descuento, total, vence_en
  )
  values (
    p_viaje_id, v_cooperativa, v_usuario, p_metodo, 'pendiente_comprobante',
    (v_preparado ->> 'subtotal')::numeric,
    (v_preparado ->> 'subtotal')::numeric - (v_preparado ->> 'total')::numeric,
    (v_preparado ->> 'total')::numeric,
    v_vence
  )
  returning id into v_compra;

  for v_pasajero in select * from jsonb_array_elements(v_preparado -> 'pasajeros')
  loop
    insert into public.boletos (
      compra_id, viaje_id, numero_asiento, pasajero_cedula, pasajero_nombres,
      pasajero_apellidos, tipo_pasajero, precio, estado
    )
    values (
      v_compra, p_viaje_id,
      (v_pasajero ->> 'numero_asiento')::smallint,
      v_pasajero ->> 'cedula',
      v_pasajero ->> 'nombres',
      v_pasajero ->> 'apellidos',
      v_pasajero ->> 'tipo',
      (v_pasajero ->> 'precio')::numeric,
      'reservado'
    );
  end loop;

  return jsonb_build_object(
    'compra_id', v_compra,
    'total', (v_preparado ->> 'total')::numeric,
    'vence_en', v_vence
  );
exception
  when unique_violation then
    raise exception 'Uno o más asientos acaban de ser ocupados. Actualiza el mapa e inténtalo de nuevo.';
end;
$$;

-- El cliente registra el comprobante que subió al almacenamiento.
create or replace function public.registrar_comprobante(p_compra_id uuid, p_ruta text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_comprador uuid;
  v_estado text;
begin
  if v_usuario is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;

  perform public.expirar_compras_vencidas();

  select c.comprador_id, c.estado
    into v_comprador, v_estado
  from public.compras as c
  where c.id = p_compra_id
  for update;

  if not found or v_comprador is distinct from v_usuario then
    raise exception 'No se encontró la compra.' using errcode = '42501';
  end if;

  if v_estado = 'vencida' then
    raise exception 'Pasaron las 3 horas para subir el comprobante. La reserva se canceló.';
  end if;

  if v_estado <> 'pendiente_comprobante' then
    raise exception 'Esta compra ya no admite comprobante (estado: %).', v_estado;
  end if;

  if p_ruta is null or p_ruta not like v_usuario::text || '/%' then
    raise exception 'La ruta del comprobante no es válida.';
  end if;

  update public.compras
  set comprobante_ruta = p_ruta,
      comprobante_subido_en = now(),
      estado = 'pendiente_validacion',
      vence_en = null
  where id = p_compra_id;
end;
$$;

-- El oficinista aprueba el pago: los boletos quedan emitidos con su código.
create or replace function public.aprobar_pago(p_compra_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_cooperativa uuid;
  v_estado text;
begin
  if v_usuario is null or public.rol_actual() is distinct from 'oficinista' then
    raise exception 'Solo un oficinista puede aprobar pagos.' using errcode = '42501';
  end if;

  select c.cooperativa_id, c.estado
    into v_cooperativa, v_estado
  from public.compras as c
  where c.id = p_compra_id
  for update;

  if not found or not public.es_de_mi_cooperativa(v_cooperativa) then
    raise exception 'No se encontró la compra en tu cooperativa.' using errcode = '42501';
  end if;

  if v_estado <> 'pendiente_validacion' then
    raise exception 'La compra no está pendiente de validación (estado: %).', v_estado;
  end if;

  update public.compras
  set estado = 'aprobada',
      validado_por = v_usuario,
      validado_en = now(),
      motivo_rechazo = null
  where id = p_compra_id;

  update public.boletos
  set estado = 'emitido',
      codigo = public._codigo_boleto()
  where compra_id = p_compra_id
    and estado = 'reservado';

  return jsonb_build_object('compra_id', p_compra_id, 'estado', 'aprobada');
end;
$$;

-- El oficinista rechaza el pago: los asientos quedan libres otra vez.
create or replace function public.rechazar_pago(p_compra_id uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_cooperativa uuid;
  v_estado text;
  v_motivo text := trim(coalesce(p_motivo, ''));
begin
  if v_usuario is null or public.rol_actual() is distinct from 'oficinista' then
    raise exception 'Solo un oficinista puede rechazar pagos.' using errcode = '42501';
  end if;

  if length(v_motivo) < 3 then
    raise exception 'Escribe el motivo del rechazo.';
  end if;

  select c.cooperativa_id, c.estado
    into v_cooperativa, v_estado
  from public.compras as c
  where c.id = p_compra_id
  for update;

  if not found or not public.es_de_mi_cooperativa(v_cooperativa) then
    raise exception 'No se encontró la compra en tu cooperativa.' using errcode = '42501';
  end if;

  if v_estado <> 'pendiente_validacion' then
    raise exception 'La compra no está pendiente de validación (estado: %).', v_estado;
  end if;

  update public.compras
  set estado = 'rechazada',
      validado_por = v_usuario,
      validado_en = now(),
      motivo_rechazo = v_motivo
  where id = p_compra_id;

  update public.boletos
  set estado = 'anulado'
  where compra_id = p_compra_id
    and estado = 'reservado';

  return jsonb_build_object('compra_id', p_compra_id, 'estado', 'rechazada');
end;
$$;

-- Autocompleta nombres a partir de la cédula (para el personal de la cooperativa).
create or replace function public.buscar_pasajero(p_cedula text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nombres text;
  v_apellidos text;
begin
  if auth.uid() is null
     or public.rol_actual() is null
     or public.rol_actual() not in ('oficinista', 'cooperativa', 'administrador', 'bus') then
    raise exception 'No tienes permiso para buscar pasajeros.' using errcode = '42501';
  end if;

  select p.nombres, p.apellidos
    into v_nombres, v_apellidos
  from public.perfiles as p
  where p.cedula = trim(p_cedula)
  limit 1;

  if not found then
    select b.pasajero_nombres, b.pasajero_apellidos
      into v_nombres, v_apellidos
    from public.boletos as b
    where b.pasajero_cedula = trim(p_cedula)
    order by b.creado_en desc
    limit 1;
  end if;

  if v_nombres is null then
    return null;
  end if;

  return jsonb_build_object('nombres', v_nombres, 'apellidos', v_apellidos);
end;
$$;

-- ======================================================================
-- 6. Comprobantes de pago (almacenamiento privado)
--    Ruta del archivo: <id del cliente>/<nombre>.jpg|png|webp|pdf
-- ======================================================================
create or replace function public.puede_validar_comprobante(p_ruta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.compras as c
    where c.comprobante_ruta = p_ruta
      and (
        public.rol_actual() = 'administrador'
        or (
          public.rol_actual() = 'oficinista'
          and public.es_de_mi_cooperativa(c.cooperativa_id)
        )
      )
  );
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprobantes',
  'comprobantes',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- Cada cliente sube archivos solo a su propia carpeta
create policy "cliente sube su comprobante"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Lo ve su dueño y el oficinista de la cooperativa de esa compra
create policy "ver comprobantes autorizados"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'comprobantes'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.puede_validar_comprobante(name)
    )
  );

-- ======================================================================
-- 7. Permisos de ejecución
-- ======================================================================
revoke execute on function public._codigo_boleto() from public, anon, authenticated;
revoke execute on function public.expirar_compras_vencidas() from public, anon, authenticated;
revoke execute on function public._viaje_para_venta(uuid) from public, anon, authenticated;
revoke execute on function public._preparar_pasajeros(uuid, jsonb) from public, anon, authenticated;

revoke execute on function public.asientos_ocupados(uuid) from public, anon;
revoke execute on function public.vender_en_oficina(uuid, jsonb) from public, anon;
revoke execute on function public.crear_compra_cliente(uuid, text, jsonb) from public, anon;
revoke execute on function public.registrar_comprobante(uuid, text) from public, anon;
revoke execute on function public.aprobar_pago(uuid) from public, anon;
revoke execute on function public.rechazar_pago(uuid, text) from public, anon;
revoke execute on function public.buscar_pasajero(text) from public, anon;
revoke execute on function public.puede_validar_comprobante(text) from public, anon;

grant execute on function public.asientos_ocupados(uuid) to authenticated;
grant execute on function public.vender_en_oficina(uuid, jsonb) to authenticated;
grant execute on function public.crear_compra_cliente(uuid, text, jsonb) to authenticated;
grant execute on function public.registrar_comprobante(uuid, text) to authenticated;
grant execute on function public.aprobar_pago(uuid) to authenticated;
grant execute on function public.rechazar_pago(uuid, text) to authenticated;
grant execute on function public.buscar_pasajero(text) to authenticated;
grant execute on function public.puede_validar_comprobante(text) to authenticated;

commit;

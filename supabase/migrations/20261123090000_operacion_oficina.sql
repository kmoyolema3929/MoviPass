-- =====================================================================
-- Cambio 4, parte 4.1: oficinista (venta en ventanilla, bandeja de
-- comprobantes y despacho del día)
--
-- Parte de la base en la nube (cambio4-base-nube.txt). No crea tablas:
--   reservas = compras, pagos = campos de compras, manifiesto = boletos.
--
-- Qué cambia:
--   1. viajes: estado operativo (lo único nuevo del cambio 4):
--        programado -> pendiente_inicio -> en_curso -> finalizado
--      con el usuario bus habilitado, quién lo habilitó y las horas reales
--      de salida y llegada (estas dos se usan en la parte 4.3).
--      Si la hoja de ruta cambia el bus de un viaje habilitado, la
--      habilitación se quita (el usuario bus era el del otro bus); un viaje
--      en curso o finalizado no puede cambiar de bus.
--   2. compras.origen: APP (cliente), OFICINA (ventanilla) o EN_RUTA
--      (usuario bus, parte 4.3). Las compras que ya existen se completan
--      con vendedor_id. Lo que no es APP se cobra en efectivo.
--   3. _viaje_para_venta: un viaje en curso o finalizado ya no se vende
--      (ni en la app ni en ventanilla).
--   4. _preparar_pasajeros: solo acepta tarifas activas (tipos_pasajero.activo).
--   5. vender_en_oficina: guarda origen OFICINA y devuelve los boletos con
--      los datos del viaje para imprimirlos con el QR.
--   6. Despacho del día (oficinista o gerente de la cooperativa):
--        - despacho_del_dia(cooperativa): viajes de hoy y usuarios bus activos;
--        - habilitar_viaje(viaje, usuario_bus): por defecto el usuario bus del
--          bus; deja el viaje "pendiente_inicio";
--        - quitar_habilitacion(viaje): vuelve a "programado".
--   7. Realtime: la tabla compras entra en la publicación supabase_realtime
--      (aviso de comprobantes nuevos). Realtime respeta la RLS de compras:
--      cada oficinista recibe solo las de su cooperativa.
--   8. Operación de rutas compartida: el oficinista gestiona las frecuencias
--      de SU cooperativa igual que el gerente (crear, editar, ordenar,
--      activar o desactivar y eliminar, con las mismas reglas: misma
--      cooperativa y no se elimina con boletos o compras). Cambian solo los
--      permisos: exigir_gestor_de_frecuencias (la usan guardar_frecuencia,
--      eliminar_frecuencia y ordenar_frecuencias), puede_gestionar_frecuencia
--      (políticas de paradas) y las políticas de escritura de frecuencias.
--      La hoja de ruta (cambio 7) y el despacho ya son de los dos. Grupos de
--      bus, plantillas, buses y personal siguen siendo solo del gerente.
--      Antes de cambiarlas se comprueba que las funciones de la nube sean las
--      esperadas; si no, la migración se detiene sin cambiar nada.
--
-- Se ejecuta en una sola transacción.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Comprobaciones previas
-- ---------------------------------------------------------------------
do $$
begin
    if to_regprocedure('public._viaje_para_venta(uuid)') is null
       or to_regprocedure('public._preparar_pasajeros(uuid, jsonb)') is null
       or to_regprocedure('public.vender_en_oficina(uuid, jsonb)') is null
       or to_regprocedure('public.fecha_hoy_ecuador()') is null
       or to_regprocedure('public.es_de_mi_cooperativa(uuid)') is null
       or to_regprocedure('public.cedula_ecuatoriana_valida(text)') is null
       or to_regprocedure('public.texto_de_nombre_valido(text)') is null then
        raise exception 'Faltan migraciones anteriores (cambios 3, 6 y 7). Aplícalas primero.';
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'tipos_pasajero' and column_name = 'activo'
    ) then
        raise exception 'Falta la columna tipos_pasajero.activo (cambio 8).';
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'buses' and column_name = 'usuario_bus_id'
    ) then
        raise exception 'Falta la columna buses.usuario_bus_id (cambio 6).';
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Estado operativo del viaje
-- ---------------------------------------------------------------------
alter table public.viajes
    add column if not exists estado_operativo varchar(20) not null default 'programado',
    add column if not exists usuario_bus_id uuid references public.perfiles (id) on delete set null,
    add column if not exists habilitado_por uuid references public.perfiles (id) on delete set null,
    add column if not exists habilitado_en timestamptz,
    add column if not exists salida_real timestamptz,
    add column if not exists llegada_real timestamptz;

alter table public.viajes drop constraint if exists viajes_estado_operativo_check;
alter table public.viajes
    add constraint viajes_estado_operativo_check
        check (estado_operativo in ('programado', 'pendiente_inicio', 'en_curso', 'finalizado'));

-- Habilitado = tiene fecha de habilitación (el usuario bus puede quedar en
-- null si su cuenta se borra; las funciones lo exigen al habilitar).
alter table public.viajes drop constraint if exists viajes_habilitado_check;
alter table public.viajes
    add constraint viajes_habilitado_check
        check (estado_operativo = 'programado' or habilitado_en is not null);

alter table public.viajes drop constraint if exists viajes_salida_real_check;
alter table public.viajes
    add constraint viajes_salida_real_check
        check (estado_operativo not in ('en_curso', 'finalizado') or salida_real is not null);

alter table public.viajes drop constraint if exists viajes_llegada_real_check;
alter table public.viajes
    add constraint viajes_llegada_real_check
        check (
            (estado_operativo <> 'finalizado' or llegada_real is not null)
            and (llegada_real is null or (salida_real is not null and llegada_real >= salida_real))
        );

create index if not exists viajes_usuario_bus_fecha_idx on public.viajes (usuario_bus_id, fecha);

-- Cambio de bus (hoja de ruta, retén) en un viaje ya habilitado o empezado.
create or replace function public.proteger_operacion_viaje()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
    if new.bus_id is distinct from old.bus_id then
        if old.estado_operativo in ('en_curso', 'finalizado') then
            raise exception 'No se puede cambiar el bus de un viaje que ya salió.' using errcode = '23514';
        end if;

        if old.estado_operativo = 'pendiente_inicio' then
            new.estado_operativo := 'programado';
            new.usuario_bus_id := null;
            new.habilitado_por := null;
            new.habilitado_en := null;
        end if;
    end if;

    return new;
end;
$function$;

drop trigger if exists viajes_proteger_operacion on public.viajes;
create trigger viajes_proteger_operacion
    before update of bus_id on public.viajes
    for each row execute function public.proteger_operacion_viaje();

-- ---------------------------------------------------------------------
-- 2. Origen de la compra
-- ---------------------------------------------------------------------
alter table public.compras add column if not exists origen varchar(10);

update public.compras
set origen = case when vendedor_id is not null then 'OFICINA' else 'APP' end
where origen is null;

alter table public.compras alter column origen set default 'APP';
alter table public.compras alter column origen set not null;

alter table public.compras drop constraint if exists compras_origen_check;
alter table public.compras
    add constraint compras_origen_check
        check (origen in ('APP', 'OFICINA', 'EN_RUTA'));

alter table public.compras drop constraint if exists compras_origen_efectivo_check;
alter table public.compras
    add constraint compras_origen_efectivo_check
        check (origen = 'APP' or metodo_pago = 'efectivo');

create index if not exists compras_viaje_origen_idx on public.compras (viaje_id, origen);

-- ---------------------------------------------------------------------
-- 3. Viaje a la venta (versión de la nube + estado operativo)
-- ---------------------------------------------------------------------
create or replace function public._viaje_para_venta(p_viaje_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_fecha date;
  v_hora time;
  v_cooperativa uuid;
  v_hoja bigint;
  v_activa boolean;
  v_estado_hoja text;
  v_operativo text;
begin
  select v.fecha, f.hora, b.cooperativa_id, v.hoja_ruta_id, f.activa, v.estado_operativo
    into v_fecha, v_hora, v_cooperativa, v_hoja, v_activa, v_operativo
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

  if v_operativo = 'finalizado' then
    raise exception 'Este viaje ya terminó.';
  end if;

  if v_operativo = 'en_curso' or (v_fecha + v_hora) < (now() at time zone 'America/Guayaquil') then
    raise exception 'Este viaje ya salió.';
  end if;

  return v_cooperativa;
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. Pasajeros (versión de la nube + solo tarifas activas)
-- ---------------------------------------------------------------------
create or replace function public._preparar_pasajeros(p_viaje_id uuid, p_pasajeros jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
    where t.codigo = v_tipo
      and t.activo;

    if not found then
      raise exception 'La tarifa del asiento % no es válida o ya no está disponible.', v_asiento
        using errcode = '23514';
    end if;

    v_cedula := btrim(coalesce(v_item ->> 'cedula', ''));
    v_nombres := pg_catalog.regexp_replace(btrim(coalesce(v_item ->> 'nombres', '')), '\s+', ' ', 'g');
    v_apellidos := pg_catalog.regexp_replace(btrim(coalesce(v_item ->> 'apellidos', '')), '\s+', ' ', 'g');

    if not public.cedula_ecuatoriana_valida(v_cedula) then
      raise exception 'La cédula del asiento % no es válida.', v_asiento using errcode = '23514';
    end if;

    if not public.texto_de_nombre_valido(v_nombres) then
      raise exception 'Revisa los nombres del asiento % (de 2 a 80 letras).', v_asiento using errcode = '23514';
    end if;

    if not public.texto_de_nombre_valido(v_apellidos) then
      raise exception 'Revisa los apellidos del asiento % (de 2 a 80 letras).', v_asiento using errcode = '23514';
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
$function$;

-- ---------------------------------------------------------------------
-- 5. Venta en ventanilla (versión de la nube + origen OFICINA)
-- ---------------------------------------------------------------------
create or replace function public.vender_en_oficina(p_viaje_id uuid, p_pasajeros jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
    viaje_id, cooperativa_id, vendedor_id, metodo_pago, estado, origen,
    subtotal, descuento, total, validado_por, validado_en
  )
  values (
    p_viaje_id, v_cooperativa, v_usuario, 'efectivo', 'aprobada', 'OFICINA',
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
    'origen', 'OFICINA',
    'emitido_en', now(),
    'subtotal', (v_preparado ->> 'subtotal')::numeric,
    'total', (v_preparado ->> 'total')::numeric,
    'boletos', v_boletos
  );
exception
  when unique_violation then
    raise exception 'Uno o más asientos acaban de ser ocupados. Actualiza el mapa e inténtalo de nuevo.';
end;
$function$;

-- ---------------------------------------------------------------------
-- 6. Despacho del día
-- ---------------------------------------------------------------------
-- Oficinista o gerente de la cooperativa (o el administrador).
create or replace function public.exigir_despachador(p_cooperativa_id uuid)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
    if auth.uid() is null then
        raise exception 'Inicia sesión.' using errcode = '42501';
    end if;

    if public.rol_actual() is distinct from 'administrador'
       and not (
           public.rol_actual() in ('oficinista', 'cooperativa')
           and public.es_de_mi_cooperativa(p_cooperativa_id)
       ) then
        raise exception 'No tienes permiso para despachar los viajes de esta cooperativa.' using errcode = '42501';
    end if;
end;
$function$;

create or replace function public.despacho_del_dia(p_cooperativa_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    v_hoy date := public.fecha_hoy_ecuador();
begin
    perform public.exigir_despachador(p_cooperativa_id);

    return jsonb_build_object(
        'fecha', v_hoy,
        'viajes', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', v.id,
                'fecha', v.fecha,
                'hora', f.hora,
                'origen', f.origen,
                'destino', f.destino,
                'tipo', f.tipo,
                'grupo', g.nombre,
                'estado_hoja', h.estado,
                'estado_operativo', v.estado_operativo,
                'habilitado_en', v.habilitado_en,
                'salida_real', v.salida_real,
                'llegada_real', v.llegada_real,
                'bus', jsonb_build_object(
                    'id', b.id, 'numero_interno', b.numero_interno, 'placa', b.placa,
                    'usuario_bus_id', b.usuario_bus_id
                ),
                'usuario_bus', case when ub.id is null then null else jsonb_build_object(
                    'id', ub.id, 'nombres', ub.nombres, 'apellidos', ub.apellidos
                ) end,
                'boletos', (
                    select count(*)
                    from public.boletos as bo
                    where bo.viaje_id = v.id and bo.estado <> 'anulado'
                )
            ) order by f.hora, b.numero_interno)
            from public.viajes as v
            join public.frecuencias as f on f.id = v.frecuencia_id
            join public.buses as b on b.id = v.bus_id
            left join public.grupos_bus as g on g.id = f.grupo_id
            left join public.hojas_ruta as h on h.id = v.hoja_ruta_id
            left join public.perfiles as ub on ub.id = v.usuario_bus_id
            where b.cooperativa_id = p_cooperativa_id
              and v.fecha = v_hoy
              and f.activa
        ), '[]'::jsonb),
        'usuarios_bus', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', p.id,
                'nombres', p.nombres,
                'apellidos', p.apellidos,
                'funcion_bus', cu.funcion_bus
            ) order by p.apellidos, p.nombres)
            from public.perfiles as p
            join public.cooperativas_usuarios as cu on cu.perfil_id = p.id
            where cu.cooperativa_id = p_cooperativa_id
              and p.rol = 'bus'
              and p.estado = 'activo'
        ), '[]'::jsonb)
    );
end;
$function$;

create or replace function public.habilitar_viaje(p_viaje_id uuid, p_usuario_bus_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_viaje public.viajes%rowtype;
    v_cooperativa uuid;
    v_usuario_bus_del_bus uuid;
    v_estado_hoja text;
    v_activa boolean;
    v_usuario uuid;
begin
    select v.* into v_viaje
    from public.viajes as v
    where v.id = p_viaje_id
    for update;

    if not found then
        raise exception 'El viaje no existe. Recarga la página.' using errcode = '40001';
    end if;

    select b.cooperativa_id, b.usuario_bus_id into v_cooperativa, v_usuario_bus_del_bus
    from public.buses as b
    where b.id = v_viaje.bus_id;

    perform public.exigir_despachador(v_cooperativa);

    if v_viaje.fecha <> public.fecha_hoy_ecuador() then
        raise exception 'Solo se pueden habilitar los viajes de hoy (%).', to_char(public.fecha_hoy_ecuador(), 'DD/MM/YYYY')
            using errcode = '23514';
    end if;

    if v_viaje.estado_operativo = 'en_curso' then
        raise exception 'El viaje ya está en curso: no se puede cambiar el usuario bus.' using errcode = '23514';
    end if;

    if v_viaje.estado_operativo = 'finalizado' then
        raise exception 'El viaje ya terminó.' using errcode = '23514';
    end if;

    select f.activa into v_activa from public.frecuencias as f where f.id = v_viaje.frecuencia_id;
    if v_activa is not true then
        raise exception 'La frecuencia de este viaje está desactivada.' using errcode = '23514';
    end if;

    if v_viaje.hoja_ruta_id is not null then
        select h.estado into v_estado_hoja from public.hojas_ruta as h where h.id = v_viaje.hoja_ruta_id;
        if v_estado_hoja = 'Cancelado' then
            raise exception 'El viaje está cancelado en la hoja de ruta.' using errcode = '23514';
        end if;
    end if;

    v_usuario := coalesce(p_usuario_bus_id, v_usuario_bus_del_bus);

    if v_usuario is null then
        raise exception 'Elige el usuario bus que hará este viaje (el bus no tiene uno asignado).' using errcode = '23514';
    end if;

    if not exists (
        select 1
        from public.perfiles as p
        join public.cooperativas_usuarios as cu on cu.perfil_id = p.id
        where p.id = v_usuario
          and p.rol = 'bus'
          and p.estado = 'activo'
          and cu.cooperativa_id = v_cooperativa
    ) then
        raise exception 'Ese usuario bus no está activo en la cooperativa del viaje.' using errcode = '23514';
    end if;

    update public.viajes
    set estado_operativo = 'pendiente_inicio',
        usuario_bus_id = v_usuario,
        habilitado_por = auth.uid(),
        habilitado_en = now()
    where id = p_viaje_id;

    return jsonb_build_object('viaje_id', p_viaje_id, 'estado_operativo', 'pendiente_inicio', 'usuario_bus_id', v_usuario);
end;
$function$;

create or replace function public.quitar_habilitacion(p_viaje_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_estado text;
    v_cooperativa uuid;
begin
    select v.estado_operativo, b.cooperativa_id into v_estado, v_cooperativa
    from public.viajes as v
    join public.buses as b on b.id = v.bus_id
    where v.id = p_viaje_id
    for update of v;

    if not found then
        raise exception 'El viaje no existe. Recarga la página.' using errcode = '40001';
    end if;

    perform public.exigir_despachador(v_cooperativa);

    if v_estado <> 'pendiente_inicio' then
        raise exception 'Solo se puede quitar la habilitación de un viaje pendiente de inicio.' using errcode = '23514';
    end if;

    update public.viajes
    set estado_operativo = 'programado',
        usuario_bus_id = null,
        habilitado_por = null,
        habilitado_en = null
    where id = p_viaje_id;

    return jsonb_build_object('viaje_id', p_viaje_id, 'estado_operativo', 'programado');
end;
$function$;

-- ---------------------------------------------------------------------
-- 7. Realtime: aviso de comprobantes nuevos
-- ---------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        create publication supabase_realtime;
    end if;

    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'compras'
    ) then
        alter publication supabase_realtime add table public.compras;
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Frecuencias: también el oficinista de la cooperativa
-- ---------------------------------------------------------------------
-- La nube debe tener las versiones esperadas (cambio 7 y cambio7-base-nube.txt).
do $$
declare
    v_esperado constant jsonb := jsonb_build_object(
        'exigir_gestor_de_frecuencias',
        'begin if public.rol_actual() is distinct from ''administrador'' and not (public.rol_actual() = ''cooperativa'' and public.es_de_mi_cooperativa(p_cooperativa_id)) then raise exception ''No tienes permiso para gestionar las frecuencias de esta cooperativa.'' using errcode = ''42501''; end if; end;',
        'puede_gestionar_frecuencia',
        'select exists ( select 1 from public.frecuencias as f where f.id = p_frecuencia_id and ( public.rol_actual() = ''administrador'' or ( public.rol_actual() = ''cooperativa'' and f.cooperativa_id is not null and public.es_de_mi_cooperativa(f.cooperativa_id) ) ) );'
    );
    v_nombre text;
    v_actual text;
begin
    for v_nombre in select jsonb_object_keys(v_esperado) loop
        select btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) into v_actual
        from pg_proc as p
        join pg_namespace as n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = v_nombre;

        if v_actual is null then
            raise exception 'Falta la función public.%. Aplica primero las migraciones del cambio 7.', v_nombre;
        end if;

        -- Ya ajustada (la migración se vuelve a ejecutar): se acepta.
        if v_actual <> v_esperado ->> v_nombre and v_actual not like '%''oficinista''%' then
            raise exception 'La función public.% en la nube no es la esperada. Envía su definición (pg_get_functiondef) antes de aplicar esta migración.', v_nombre;
        end if;
    end loop;
end;
$$;

create or replace function public.exigir_gestor_de_frecuencias(p_cooperativa_id uuid)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
    if public.rol_actual() is distinct from 'administrador'
       and not (public.rol_actual() in ('cooperativa', 'oficinista') and public.es_de_mi_cooperativa(p_cooperativa_id)) then
        raise exception 'No tienes permiso para gestionar las frecuencias de esta cooperativa.'
            using errcode = '42501';
    end if;
end;
$function$;

create or replace function public.puede_gestionar_frecuencia(p_frecuencia_id bigint)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.frecuencias as f
    where f.id = p_frecuencia_id
      and (
        public.rol_actual() = 'administrador'
        or (
          public.rol_actual() in ('cooperativa', 'oficinista')
          and f.cooperativa_id is not null
          and public.es_de_mi_cooperativa(f.cooperativa_id)
        )
      )
  );
$function$;

-- Escritura directa en frecuencias (activar o desactivar desde la pantalla).
-- La lectura no cambia: el oficinista ya lee las frecuencias.
drop policy if exists "crear frecuencias autorizadas" on public.frecuencias;
create policy "crear frecuencias autorizadas"
    on public.frecuencias for insert
    to authenticated
    with check (
        (select public.rol_actual()) = 'administrador'
        or (
            (select public.rol_actual()) in ('cooperativa', 'oficinista')
            and cooperativa_id is not null
            and public.es_de_mi_cooperativa(cooperativa_id)
        )
    );

drop policy if exists "editar frecuencias autorizadas" on public.frecuencias;
create policy "editar frecuencias autorizadas"
    on public.frecuencias for update
    to authenticated
    using (
        (select public.rol_actual()) = 'administrador'
        or (
            (select public.rol_actual()) in ('cooperativa', 'oficinista')
            and cooperativa_id is not null
            and public.es_de_mi_cooperativa(cooperativa_id)
        )
    )
    with check (
        (select public.rol_actual()) = 'administrador'
        or (
            (select public.rol_actual()) in ('cooperativa', 'oficinista')
            and cooperativa_id is not null
            and public.es_de_mi_cooperativa(cooperativa_id)
        )
    );

drop policy if exists "eliminar frecuencias autorizadas" on public.frecuencias;
create policy "eliminar frecuencias autorizadas"
    on public.frecuencias for delete
    to authenticated
    using (
        (select public.rol_actual()) = 'administrador'
        or (
            (select public.rol_actual()) in ('cooperativa', 'oficinista')
            and cooperativa_id is not null
            and public.es_de_mi_cooperativa(cooperativa_id)
        )
    );

-- ---------------------------------------------------------------------
-- 9. Permisos de las funciones
-- ---------------------------------------------------------------------
do $$
declare
    v_funcion text;
begin
    foreach v_funcion in array array[
        'public.despacho_del_dia(uuid)',
        'public.habilitar_viaje(uuid, uuid)',
        'public.quitar_habilitacion(uuid)',
        'public.vender_en_oficina(uuid, jsonb)'
    ]
    loop
        execute format('revoke all on function %s from public, anon', v_funcion);
        execute format('grant execute on function %s to authenticated', v_funcion);
    end loop;

    foreach v_funcion in array array[
        'public.exigir_despachador(uuid)',
        'public.proteger_operacion_viaje()',
        'public._viaje_para_venta(uuid)',
        'public._preparar_pasajeros(uuid, jsonb)'
    ]
    loop
        execute format('revoke all on function %s from public, anon, authenticated', v_funcion);
    end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;

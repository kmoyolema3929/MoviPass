-- =====================================================================
-- Cambio 4, parte 4.3: app del usuario bus (chofer, controlador o dueño)
--
-- Parte de la base en la nube (cambio4-base-nube.txt) con las migraciones
-- 20261123090000_operacion_oficina.sql, 20261124090000_compra_cliente.sql y
-- 20261125090000_viajes_en_venta.sql aplicadas. No crea tablas.
--
-- Qué cambia:
--   1. boletos: estado nuevo "abordado" (el pasajero subió al bus), con la
--      hora y quién lo validó, y la parada donde subió (venta en ruta).
--      El asiento de un boleto abordado sigue ocupado: entra en el índice
--      único boletos_asiento_activo_uq y en las funciones que cuentan
--      asientos ocupados (asientos_ocupados, bus_tiene_boletos_pendientes,
--      exigir_boletos_sin_cambios, obtener_hoja_ruta y reemplazar_con_reten,
--      copiadas de cambio4-base-nube.txt con el estado nuevo).
--      boletos_dia_hoja_ruta cuenta todos los estados: no cambia.
--   2. Operación del viaje, solo en los viajes asignados a quien inicia
--      sesión (viajes.usuario_bus_id = auth.uid(), rol bus):
--        - mis_viajes_de_hoy(): viajes de hoy (y el que siga en curso);
--        - iniciar_viaje(viaje): pendiente_inicio -> en_curso + salida_real;
--        - finalizar_viaje(viaje): en_curso -> finalizado + llegada_real
--          (cierra ventas y validaciones);
--        - mapa_del_viaje(viaje) y manifiesto_del_viaje(viaje);
--        - validar_boleto(viaje, código o boleto): emitido -> abordado.
--          Devuelve el resultado (abordado, ya_abordo, otro_viaje,
--          no_pagado, anulado o no_existe) con la tarifa pagada;
--        - vender_en_ruta(viaje, pasajeros, parada): solo con el viaje en
--          curso, efectivo, origen EN_RUTA. Precio: el completo del viaje con
--          el descuento de la tarifa (opción A, igual que la ventanilla).
--          El boleto queda abordado (el pasajero ya está en el bus).
--      Validar y vender exigen el viaje en curso: pendiente de inicio o
--      finalizado se rechazan con un mensaje claro.
--   3. Recaudación en camino (solo boletos EN_RUTA, total en efectivo):
--        - recaudacion_en_ruta(viaje): el usuario bus del viaje, el
--          oficinista o el gerente de la cooperativa (y el administrador);
--        - recaudacion_de_cooperativa(cooperativa, desde, hasta): lista
--          para el oficinista y el gerente;
--        - historial_viajes_bus(desde, hasta): viajes del usuario bus.
--   4. Realtime: boletos entra en supabase_realtime (mapa en tiempo real).
--      El usuario bus lee (y recibe) solo los boletos de sus viajes.
--
-- Se ejecuta en una sola transacción.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Comprobaciones previas
-- ---------------------------------------------------------------------
do $$
declare
    v_nombre text;
    v_actual text;
begin
    if to_regprocedure('public.habilitar_viaje(uuid, uuid)') is null
       or to_regprocedure('public.exigir_despachador(uuid)') is null
       or not exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'compras' and column_name = 'origen'
       ) then
        raise exception 'Falta la parte 4.1. Aplica primero 20261123090000_operacion_oficina.sql.';
    end if;

    if to_regprocedure('public.viaje_a_la_venta(uuid)') is null then
        raise exception 'Falta el ajuste de la parte 4.2. Aplica primero 20261125090000_viajes_en_venta.sql.';
    end if;

    if to_regprocedure('public._preparar_pasajeros(uuid, jsonb)') is null
       or to_regprocedure('public._codigo_boleto()') is null
       or to_regprocedure('public.fecha_hoy_ecuador()') is null
       or to_regprocedure('public.rol_actual()') is null then
        raise exception 'Faltan funciones de los cambios anteriores (_preparar_pasajeros, _codigo_boleto, fecha_hoy_ecuador o rol_actual).';
    end if;

    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.boletos'::regclass and conname = 'boletos_estado_check'
    ) then
        raise exception 'No existe la restricción boletos_estado_check. Envía las restricciones de public.boletos antes de aplicar esta migración.';
    end if;

    -- Las funciones que cuentan asientos ocupados deben ser las de
    -- cambio4-base-nube.txt (o ya ajustadas, si la migración se repite).
    foreach v_nombre in array array[
        'asientos_ocupados', 'bus_tiene_boletos_pendientes', 'exigir_boletos_sin_cambios',
        'obtener_hoja_ruta', 'reemplazar_con_reten'
    ] loop
        select string_agg(p.prosrc, ' ') into v_actual
        from pg_proc as p
        join pg_namespace as n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = v_nombre;

        if v_actual is null then
            raise exception 'Falta la función public.%. Aplica las migraciones anteriores.', v_nombre;
        end if;

        if v_actual not like '%''abordado''%'
           and v_actual not like '%in (''reservado'', ''emitido'')%' then
            raise exception 'La función public.% en la nube no es la esperada. Envía su definición (pg_get_functiondef) antes de aplicar esta migración.', v_nombre;
        end if;
    end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Boletos: estado "abordado" y parada de subida
-- ---------------------------------------------------------------------
alter table public.boletos
    add column if not exists abordado_en timestamptz,
    add column if not exists abordado_por uuid references public.perfiles (id) on delete set null,
    add column if not exists parada_id bigint references public.paradas (id) on delete set null,
    add column if not exists parada_subida varchar(80);

alter table public.boletos drop constraint if exists boletos_estado_check;
alter table public.boletos
    add constraint boletos_estado_check
        check (estado in ('reservado', 'emitido', 'abordado', 'anulado'));

alter table public.boletos drop constraint if exists boletos_abordado_check;
alter table public.boletos
    add constraint boletos_abordado_check
        check (estado <> 'abordado' or (abordado_en is not null and codigo is not null));

alter table public.boletos drop constraint if exists boletos_parada_subida_check;
alter table public.boletos
    add constraint boletos_parada_subida_check
        check (parada_subida is null or (length(btrim(parada_subida)) between 1 and 80));

-- El asiento de un pasajero que ya abordó sigue ocupado.
drop index if exists public.boletos_asiento_activo_uq;
create unique index boletos_asiento_activo_uq
    on public.boletos (viaje_id, numero_asiento)
    where estado in ('reservado', 'emitido', 'abordado');

create index if not exists boletos_viaje_estado_idx on public.boletos (viaje_id, estado);

-- ---------------------------------------------------------------------
-- 2. Funciones que cuentan asientos ocupados (cambio4-base-nube.txt,
--    con el estado "abordado")
-- ---------------------------------------------------------------------
-- asientos_ocupados: copia de cambio4-base-nube.txt; cambia solo la lista de estados.
CREATE OR REPLACE FUNCTION public.asientos_ocupados(p_viaje_id uuid)
 RETURNS smallint[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        and b.estado in ('reservado', 'emitido', 'abordado')
    ),
    '{}'::smallint[]
  );
end;
$function$;

-- bus_tiene_boletos_pendientes: copia de cambio4-base-nube.txt; cambia solo la lista de estados.
CREATE OR REPLACE FUNCTION public.bus_tiene_boletos_pendientes(p_bus_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    select exists (
        select 1
        from public.boletos as bo
        join public.viajes as v on v.id = bo.viaje_id
        where v.bus_id = p_bus_id
          and bo.estado in ('reservado', 'emitido', 'abordado')
          and v.fecha >= (now() at time zone 'America/Guayaquil')::date
    );
$function$;

-- exigir_boletos_sin_cambios: copia de cambio4-base-nube.txt; cambia solo la lista de estados.
CREATE OR REPLACE FUNCTION public.exigir_boletos_sin_cambios(p_plantilla_actual uuid, p_bus_id uuid, p_distribucion jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
    v_cantidad int;
    v_detalle text;
begin
    if p_plantilla_actual is null then
        return;
    end if;

    select count(*),
           string_agg(af.linea, '; ' order by af.orden) filter (where af.orden <= 20)
      into v_cantidad, v_detalle
    from (
        select
            row_number() over (
                order by v.fecha, b.placa, bo.numero_asiento
            ) as orden,
            format(
                '%s · bus %s · asiento %s · %s · %s',
                to_char(v.fecha, 'DD/MM/YYYY'),
                b.placa,
                bo.numero_asiento,
                coalesce('código ' || bo.codigo, 'reservado, sin código'),
                coalesce(
                    (
                        select 'su lugar pasaría a ser ' ||
                               case e.value ->> 'tipo'
                                   when 'bano' then 'baño'
                                   when 'puerta' then 'puerta'
                                   when 'escalera' then 'escalera'
                                   when 'cabina' then 'cabina'
                                   when 'vacio' then 'espacio vacío'
                                   else 'pasillo'
                               end
                        from jsonb_array_elements(
                            coalesce(
                                p_distribucion -> (pa.piso - 1) -> 'celdas_especiales',
                                '[]'::jsonb
                            )
                        ) as e
                        where (e.value ->> 'fila')::int = pa.fila
                          and (e.value ->> 'columna')::int = pa.columna
                        limit 1
                    ),
                    case
                        when n.numero is null then 'el asiento dejaría de existir'
                        when n.tipo = 'bloqueado' then 'el asiento quedaría bloqueado'
                        else 'el asiento cambiaría de lugar'
                    end
                )
            ) as linea
        from public.boletos as bo
        join public.viajes as v
            on v.id = bo.viaje_id
        join public.buses as b
            on b.id = v.bus_id
        join public.plantilla_asientos as pa
            on pa.plantilla_id = p_plantilla_actual
           and pa.numero = bo.numero_asiento
        left join public.asientos_de_distribucion(p_distribucion) as n
            on n.numero = bo.numero_asiento
        where b.plantilla_id = p_plantilla_actual
          and (p_bus_id is null or b.id = p_bus_id)
          and bo.estado in ('reservado', 'emitido', 'abordado')
          -- Fecha de Ecuador (la base trabaja en UTC).
          and v.fecha >= (now() at time zone 'America/Guayaquil')::date
          and (
              n.numero is null
              or n.tipo = 'bloqueado'
              or (n.piso, n.fila, n.columna)
                 is distinct from (pa.piso::int, pa.fila::int, pa.columna::int)
          )
    ) as af;

    if v_cantidad > 0 then
        raise exception '%',
            'No se puede cambiar la distribución: ' || v_cantidad ||
            case when v_cantidad = 1
                then ' boleto vendido en un viaje pendiente quedaría sin asiento o en otro lugar. '
                else ' boletos vendidos en viajes pendientes quedarían sin asiento o en otro lugar. '
            end ||
            'Boletos afectados: ' || v_detalle ||
            case when v_cantidad > 20
                then ' (y ' || (v_cantidad - 20) || ' más).'
                else '.'
            end
            using errcode = '55006',
                  hint = 'Anula o cambia esos boletos antes de modificar la plantilla.';
    end if;
end;
$function$;

-- obtener_hoja_ruta: copia de cambio4-base-nube.txt; cambia solo la lista de estados.
CREATE OR REPLACE FUNCTION public.obtener_hoja_ruta(p_grupo_id uuid, p_desde date, p_hasta date)
 RETURNS TABLE(fecha date, tipo text, frecuencia_id bigint, posicion integer, hoja_ruta_id bigint, bus_id uuid, numero_interno text, placa text, boletos integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
    perform public.exigir_gestor_de_hoja_ruta(p_grupo_id);

    return query
    select h.fecha, 'frecuencia'::text, h.frecuencia_id, null::int, h.id, h.bus_id,
           b.numero_interno::text, b.placa::text,
           (select count(*)::int from public.boletos as bo join public.viajes as v on v.id = bo.viaje_id
            where v.hoja_ruta_id = h.id and bo.estado in ('reservado', 'emitido', 'abordado'))
    from public.hojas_ruta as h
    join public.frecuencias as f on f.id = h.frecuencia_id
    join public.buses as b on b.id = h.bus_id
    where f.grupo_id = p_grupo_id and h.fecha between p_desde and p_hasta
    union all
    select p.fecha, p.tipo::text, null::bigint, p.posicion::int, null::bigint, p.bus_id,
           b.numero_interno::text, b.placa::text, 0
    from public.hojas_ruta_paradas as p
    join public.buses as b on b.id = p.bus_id
    where p.grupo_id = p_grupo_id and p.fecha between p_desde and p_hasta;
end;
$function$;

-- reemplazar_con_reten: copia de cambio4-base-nube.txt; cambia solo la lista de estados.
CREATE OR REPLACE FUNCTION public.reemplazar_con_reten(p_hoja_ruta_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_hoy date := (now() at time zone 'America/Guayaquil')::date;
    v_hoja public.hojas_ruta%rowtype;
    v_grupo uuid;
    v_reten public.hojas_ruta_paradas%rowtype;
    v_faltan text;
begin
    select h.* into v_hoja from public.hojas_ruta as h where h.id = p_hoja_ruta_id for update;

    if not found then
        raise exception 'Ese turno ya no existe. Recarga la página.' using errcode = '40001';
    end if;

    select f.grupo_id into v_grupo from public.frecuencias as f where f.id = v_hoja.frecuencia_id;
    perform public.exigir_gestor_de_hoja_ruta(v_grupo);

    if v_hoja.fecha < v_hoy then
        raise exception 'No se puede cambiar un día pasado.' using errcode = '23514';
    end if;

    select p.* into v_reten
    from public.hojas_ruta_paradas as p
    where p.grupo_id = v_grupo and p.fecha = v_hoja.fecha and p.tipo = 'reten'
    for update;

    if not found then
        raise exception 'Ese día no tiene bus de retén.' using errcode = '23514';
    end if;

    -- Boletos vendidos: sus asientos deben existir (y no estar bloqueados) en el bus del retén.
    select string_agg(distinct bo.numero_asiento::text, ', ')
      into v_faltan
    from public.boletos as bo
    join public.viajes as v on v.id = bo.viaje_id
    where v.hoja_ruta_id = v_hoja.id
      and bo.estado in ('reservado', 'emitido', 'abordado')
      and not exists (
          select 1
          from public.buses as br
          join public.plantilla_asientos as pa on pa.plantilla_id = br.plantilla_id
          where br.id = v_reten.bus_id
            and pa.numero = bo.numero_asiento
            and pa.tipo <> 'bloqueado'
      );

    if v_faltan is not null then
        raise exception 'No se puede usar el retén: los asientos vendidos % no existen o están bloqueados en el bus del retén.', v_faltan
            using errcode = '55006';
    end if;

    perform set_config('movipass.intercambio_reten', 'si', true);

    update public.hojas_ruta set bus_id = v_reten.bus_id where id = v_hoja.id;
    update public.hojas_ruta_paradas set bus_id = v_hoja.bus_id where id = v_reten.id;

    perform set_config('movipass.intercambio_reten', '', true);

    return jsonb_build_object('bus_frecuencia', v_reten.bus_id, 'bus_reten', v_hoja.bus_id);
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. Ayudas internas
-- ---------------------------------------------------------------------
-- Viaje asignado a quien inicia sesión (rol bus), bloqueado para el cambio.
create or replace function public._mi_viaje_asignado(p_viaje_id uuid)
returns public.viajes
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_viaje public.viajes%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Inicia sesión.' using errcode = '42501';
    end if;

    if public.rol_actual() is distinct from 'bus' then
        raise exception 'Solo el usuario bus del viaje puede operarlo.' using errcode = '42501';
    end if;

    select v.* into v_viaje
    from public.viajes as v
    where v.id = p_viaje_id
    for update;

    if not found then
        raise exception 'El viaje no existe. Vuelve a Mis viajes.' using errcode = '40001';
    end if;

    if v_viaje.usuario_bus_id is distinct from auth.uid() then
        raise exception 'Este viaje no está asignado a tu cuenta. Consulta con la oficina.' using errcode = '42501';
    end if;

    return v_viaje;
end;
$function$;

-- Validar y vender: solo con el viaje en curso.
create or replace function public._exigir_viaje_en_curso(p_estado text)
returns void
language plpgsql
stable
set search_path to ''
as $function$
begin
    if p_estado = 'pendiente_inicio' then
        raise exception 'Primero inicia el viaje: mientras está pendiente de inicio no se puede validar ni vender.'
            using errcode = '23514';
    end if;

    if p_estado = 'finalizado' then
        raise exception 'El viaje ya finalizó: las ventas y validaciones están cerradas.'
            using errcode = '23514';
    end if;

    if p_estado is distinct from 'en_curso' then
        raise exception 'El viaje ya no está habilitado. Consulta con la oficina.'
            using errcode = '23514';
    end if;
end;
$function$;

-- Datos del viaje para la app del usuario bus y los reportes.
create or replace function public._datos_viaje_operacion(p_viaje_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
    select jsonb_build_object(
        'id', v.id,
        'fecha', v.fecha,
        'hora', f.hora,
        'origen', f.origen,
        'destino', f.destino,
        'tipo', f.tipo,
        'precio', v.precio,
        'estado_operativo', v.estado_operativo,
        'habilitado_en', v.habilitado_en,
        'salida_real', v.salida_real,
        'llegada_real', v.llegada_real,
        'estado_hoja', h.estado,
        'cooperativa', jsonb_build_object('id', c.id, 'nombre', c.nombre),
        'bus', jsonb_build_object('id', b.id, 'numero_interno', b.numero_interno, 'placa', b.placa),
        'usuario_bus', case when ub.id is null then null else jsonb_build_object(
            'id', ub.id, 'nombres', ub.nombres, 'apellidos', ub.apellidos
        ) end,
        'paradas', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', p.id, 'nombre', p.nombre, 'hora_estimada', p.hora_estimada, 'orden', p.orden
            ) order by p.orden, p.hora_estimada)
            from public.paradas as p
            where p.frecuencia_id = v.frecuencia_id
        ), '[]'::jsonb),
        'asientos', (
            select count(*)
            from public.asientos as a
            where a.bus_id = v.bus_id
              and coalesce(a.tipo, '') <> 'bloqueado'
        ),
        'ocupados', (
            select count(*) from public.boletos as bo
            where bo.viaje_id = v.id and bo.estado in ('reservado', 'emitido', 'abordado')
        ),
        'abordados', (
            select count(*) from public.boletos as bo
            where bo.viaje_id = v.id and bo.estado = 'abordado'
        ),
        'por_abordar', (
            select count(*) from public.boletos as bo
            where bo.viaje_id = v.id and bo.estado = 'emitido'
        ),
        'sin_pagar', (
            select count(*) from public.boletos as bo
            where bo.viaje_id = v.id and bo.estado = 'reservado'
        ),
        'en_ruta', (
            select jsonb_build_object('pasajeros', count(*), 'total', coalesce(sum(bo.precio), 0))
            from public.boletos as bo
            join public.compras as co on co.id = bo.compra_id
            where bo.viaje_id = v.id
              and co.origen = 'EN_RUTA'
              and bo.estado <> 'anulado'
        )
    )
    from public.viajes as v
    join public.frecuencias as f on f.id = v.frecuencia_id
    join public.buses as b on b.id = v.bus_id
    join public.cooperativas as c on c.id = b.cooperativa_id
    left join public.hojas_ruta as h on h.id = v.hoja_ruta_id
    left join public.perfiles as ub on ub.id = v.usuario_bus_id
    where v.id = p_viaje_id;
$function$;

-- Quién puede ver el manifiesto y la recaudación de un viaje: su usuario
-- bus, o el oficinista y el gerente de la cooperativa (y el administrador).
create or replace function public._exigir_lector_del_viaje(p_viaje_id uuid)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    v_usuario_bus uuid;
    v_cooperativa uuid;
begin
    if auth.uid() is null then
        raise exception 'Inicia sesión.' using errcode = '42501';
    end if;

    select v.usuario_bus_id, b.cooperativa_id into v_usuario_bus, v_cooperativa
    from public.viajes as v
    join public.buses as b on b.id = v.bus_id
    where v.id = p_viaje_id;

    if not found then
        raise exception 'El viaje no existe.' using errcode = '40001';
    end if;

    if public.rol_actual() = 'bus' then
        if v_usuario_bus is distinct from auth.uid() then
            raise exception 'Este viaje no está asignado a tu cuenta.' using errcode = '42501';
        end if;
        return;
    end if;

    perform public.exigir_despachador(v_cooperativa);
end;
$function$;

-- El viaje está asignado a quien consulta (política de lectura de boletos).
create or replace function public.es_viaje_asignado_a_mi(p_viaje_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
    select auth.uid() is not null and exists (
        select 1
        from public.viajes as v
        where v.id = p_viaje_id
          and v.usuario_bus_id = auth.uid()
    );
$function$;

-- Rango de fechas de los reportes (máximo 92 días).
create or replace function public._revisar_rango_fechas(p_desde date, p_hasta date)
returns void
language plpgsql
stable
set search_path to ''
as $function$
begin
    if p_desde is null or p_hasta is null then
        raise exception 'Indica la fecha desde y la fecha hasta.' using errcode = '22023';
    end if;

    if p_desde > p_hasta then
        raise exception 'La fecha desde no puede ser posterior a la fecha hasta.' using errcode = '22023';
    end if;

    if p_hasta - p_desde > 92 then
        raise exception 'Elige un rango de hasta 92 días.' using errcode = '22023';
    end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. Mis viajes de hoy, iniciar y finalizar
-- ---------------------------------------------------------------------
create or replace function public.mis_viajes_de_hoy()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    v_hoy date := public.fecha_hoy_ecuador();
begin
    if auth.uid() is null or public.rol_actual() is distinct from 'bus' then
        raise exception 'Solo un usuario bus tiene viajes asignados.' using errcode = '42501';
    end if;

    return jsonb_build_object(
        'fecha', v_hoy,
        'viajes', coalesce((
            select jsonb_agg(public._datos_viaje_operacion(v.id) order by v.fecha, f.hora)
            from public.viajes as v
            join public.frecuencias as f on f.id = v.frecuencia_id
            where v.usuario_bus_id = auth.uid()
              and v.estado_operativo <> 'programado'
              -- El viaje que sigue en curso pasada la medianoche también se ve.
              and (v.fecha = v_hoy or v.estado_operativo = 'en_curso')
        ), '[]'::jsonb)
    );
end;
$function$;

create or replace function public.iniciar_viaje(p_viaje_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_viaje public.viajes%rowtype;
    v_estado_hoja text;
    v_otro text;
begin
    v_viaje := public._mi_viaje_asignado(p_viaje_id);

    if v_viaje.estado_operativo = 'en_curso' then
        raise exception 'El viaje ya está en curso (salió a las %).',
            to_char(v_viaje.salida_real at time zone 'America/Guayaquil', 'HH24:MI')
            using errcode = '23514';
    end if;

    if v_viaje.estado_operativo = 'finalizado' then
        raise exception 'El viaje ya finalizó.' using errcode = '23514';
    end if;

    if v_viaje.estado_operativo <> 'pendiente_inicio' then
        raise exception 'El viaje ya no está habilitado. Consulta con la oficina.' using errcode = '23514';
    end if;

    if v_viaje.fecha <> public.fecha_hoy_ecuador() then
        raise exception 'Solo puedes iniciar los viajes de hoy (%).', to_char(public.fecha_hoy_ecuador(), 'DD/MM/YYYY')
            using errcode = '23514';
    end if;

    if v_viaje.hoja_ruta_id is not null then
        select h.estado into v_estado_hoja from public.hojas_ruta as h where h.id = v_viaje.hoja_ruta_id;
        if v_estado_hoja = 'Cancelado' then
            raise exception 'El viaje está cancelado en la hoja de ruta. Consulta con la oficina.' using errcode = '23514';
        end if;
    end if;

    -- Un usuario bus maneja un viaje a la vez.
    select format('%s → %s de las %s', f.origen, f.destino, to_char(f.hora, 'HH24:MI'))
      into v_otro
    from public.viajes as v
    join public.frecuencias as f on f.id = v.frecuencia_id
    where v.usuario_bus_id = auth.uid()
      and v.estado_operativo = 'en_curso'
      and v.id <> p_viaje_id
    limit 1;

    if v_otro is not null then
        raise exception 'Primero finaliza el viaje en curso (%).', v_otro using errcode = '23514';
    end if;

    update public.viajes
    set estado_operativo = 'en_curso',
        salida_real = now()
    where id = p_viaje_id;

    return public._datos_viaje_operacion(p_viaje_id);
end;
$function$;

create or replace function public.finalizar_viaje(p_viaje_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_viaje public.viajes%rowtype;
begin
    v_viaje := public._mi_viaje_asignado(p_viaje_id);

    if v_viaje.estado_operativo = 'finalizado' then
        raise exception 'El viaje ya finalizó (llegó a las %).',
            to_char(v_viaje.llegada_real at time zone 'America/Guayaquil', 'HH24:MI')
            using errcode = '23514';
    end if;

    if v_viaje.estado_operativo <> 'en_curso' then
        raise exception 'Solo se puede finalizar un viaje en curso.' using errcode = '23514';
    end if;

    update public.viajes
    set estado_operativo = 'finalizado',
        llegada_real = greatest(now(), salida_real)
    where id = p_viaje_id;

    return public._datos_viaje_operacion(p_viaje_id);
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. Mapa de asientos y manifiesto
-- ---------------------------------------------------------------------
create or replace function public.mapa_del_viaje(p_viaje_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    v_bus uuid;
begin
    perform public._exigir_lector_del_viaje(p_viaje_id);

    select v.bus_id into v_bus from public.viajes as v where v.id = p_viaje_id;

    return jsonb_build_object(
        'asientos', coalesce((
            select jsonb_agg(jsonb_build_object(
                'numero', a.numero, 'piso', a.piso, 'fila', a.fila, 'columna', a.columna, 'tipo', a.tipo
            ) order by a.numero)
            from public.asientos as a
            where a.bus_id = v_bus
        ), '[]'::jsonb),
        'distribucion', (
            select pb.distribucion
            from public.buses as b
            join public.plantillas_bus as pb on pb.id = b.plantilla_id
            where b.id = v_bus
        ),
        'ocupados', coalesce((
            select jsonb_agg(bo.numero_asiento order by bo.numero_asiento)
            from public.boletos as bo
            where bo.viaje_id = p_viaje_id
              and bo.estado in ('reservado', 'emitido', 'abordado')
        ), '[]'::jsonb)
    );
end;
$function$;

create or replace function public.manifiesto_del_viaje(p_viaje_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
    perform public._exigir_lector_del_viaje(p_viaje_id);

    return jsonb_build_object(
        'viaje', public._datos_viaje_operacion(p_viaje_id),
        'boletos', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', bo.id,
                'codigo', bo.codigo,
                'numero_asiento', bo.numero_asiento,
                'cedula', bo.pasajero_cedula,
                'nombres', bo.pasajero_nombres,
                'apellidos', bo.pasajero_apellidos,
                'tipo', bo.tipo_pasajero,
                'tarifa', tp.nombre,
                'descuento', tp.descuento,
                'precio', bo.precio,
                'estado', bo.estado,
                'abordado_en', bo.abordado_en,
                'parada_subida', bo.parada_subida,
                'origen', co.origen,
                'estado_compra', co.estado
            ) order by bo.numero_asiento)
            from public.boletos as bo
            join public.compras as co on co.id = bo.compra_id
            left join public.tipos_pasajero as tp on tp.codigo = bo.tipo_pasajero
            where bo.viaje_id = p_viaje_id
              and bo.estado <> 'anulado'
        ), '[]'::jsonb)
    );
end;
$function$;

-- ---------------------------------------------------------------------
-- 6. Validar el boleto al abordar
-- ---------------------------------------------------------------------
-- Por código (QR o escrito a mano) o por el boleto elegido en el manifiesto
-- o en la búsqueda por cédula. No lanza error por el estado del boleto:
-- devuelve el resultado para mostrarlo en grande.
create or replace function public.validar_boleto(
    p_viaje_id uuid,
    p_codigo text default null,
    p_boleto_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_viaje public.viajes%rowtype;
    v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'));
    v_boleto public.boletos%rowtype;
    v_compra public.compras%rowtype;
    v_cooperativa uuid;
    v_otro text;
    v_resultado text;
    v_mensaje text;
    v_datos jsonb;
begin
    v_viaje := public._mi_viaje_asignado(p_viaje_id);
    perform public._exigir_viaje_en_curso(v_viaje.estado_operativo);

    if p_boleto_id is null then
        if v_codigo = '' then
            raise exception 'Escanea el código QR o escribe el código del boleto.' using errcode = '23514';
        end if;

        -- Se acepta el código sin el prefijo "MP-".
        if v_codigo ~ '^[0-9A-F]{10}$' then
            v_codigo := 'MP-' || v_codigo;
        end if;

        if length(v_codigo) > 40 then
            raise exception 'El código del boleto no es válido (ejemplo: MP-1A2B3C4D5E).' using errcode = '23514';
        end if;

        select bo.* into v_boleto from public.boletos as bo where bo.codigo = v_codigo for update;
    else
        select bo.* into v_boleto from public.boletos as bo where bo.id = p_boleto_id for update;
    end if;

    if not found then
        return jsonb_build_object(
            'resultado', 'no_existe',
            'mensaje', case when p_boleto_id is null
                then format('No existe un boleto con el código %s. Revisa el código o busca por cédula.', v_codigo)
                else 'Ese boleto ya no existe. Actualiza el manifiesto.' end,
            'boleto', null
        );
    end if;

    select co.* into v_compra from public.compras as co where co.id = v_boleto.compra_id;

    select b.cooperativa_id into v_cooperativa from public.buses as b where b.id = v_viaje.bus_id;

    if v_boleto.viaje_id <> p_viaje_id then
        select format('%s → %s, %s a las %s', f.origen, f.destino, to_char(v.fecha, 'DD/MM/YYYY'), to_char(f.hora, 'HH24:MI'))
          into v_otro
        from public.viajes as v
        join public.frecuencias as f on f.id = v.frecuencia_id
        where v.id = v_boleto.viaje_id;

        return jsonb_build_object(
            'resultado', 'otro_viaje',
            'mensaje', case when v_compra.cooperativa_id = v_cooperativa
                then format('Este boleto es de otro viaje: %s (asiento %s). No puede abordar este bus.', v_otro, v_boleto.numero_asiento)
                else 'Este boleto es de otro viaje de otra cooperativa. No puede abordar este bus.' end,
            'boleto', null
        );
    end if;

    if v_boleto.estado = 'anulado' then
        v_resultado := 'anulado';
        v_mensaje := 'Este boleto fue anulado'
            || case v_compra.estado
                   when 'vencida' then ' (la reserva venció sin pago)'
                   when 'rechazada' then ' (la oficina rechazó el pago)'
                   else '' end
            || '. No puede abordar.';
    elsif v_boleto.estado = 'reservado' or v_compra.estado <> 'aprobada' then
        v_resultado := 'no_pagado';
        v_mensaje := 'Este boleto no está pagado: '
            || case v_compra.estado
                   when 'pendiente_comprobante' then 'el cliente aún no sube el comprobante de pago.'
                   when 'pendiente_validacion' then 'la oficina aún no valida el comprobante.'
                   else 'el pago no fue aprobado.' end
            || ' No puede abordar hasta que se apruebe.';
    elsif v_boleto.estado = 'abordado' then
        v_resultado := 'ya_abordo';
        v_mensaje := format('Este pasajero ya abordó a las %s.',
            to_char(v_boleto.abordado_en at time zone 'America/Guayaquil', 'HH24:MI'));
    else
        update public.boletos
        set estado = 'abordado',
            abordado_en = now(),
            abordado_por = auth.uid()
        where id = v_boleto.id
        returning * into v_boleto;

        v_resultado := 'abordado';
        v_mensaje := format('Puede abordar. Asiento %s.', v_boleto.numero_asiento);
    end if;

    select jsonb_build_object(
        'id', v_boleto.id,
        'codigo', v_boleto.codigo,
        'numero_asiento', v_boleto.numero_asiento,
        'cedula', v_boleto.pasajero_cedula,
        'nombres', v_boleto.pasajero_nombres,
        'apellidos', v_boleto.pasajero_apellidos,
        'tipo', v_boleto.tipo_pasajero,
        'tarifa', tp.nombre,
        'descuento', tp.descuento,
        'precio', v_boleto.precio,
        'estado', v_boleto.estado,
        'abordado_en', v_boleto.abordado_en,
        'origen', v_compra.origen
    ) into v_datos
    from public.tipos_pasajero as tp
    where tp.codigo = v_boleto.tipo_pasajero;

    return jsonb_build_object('resultado', v_resultado, 'mensaje', v_mensaje, 'boleto', v_datos);
end;
$function$;

-- ---------------------------------------------------------------------
-- 7. Venta en ruta
-- ---------------------------------------------------------------------
-- p_parada: 'origen' (sube en el origen de la frecuencia) o el id de una
-- parada de la frecuencia. Obligatoria.
create or replace function public.vender_en_ruta(p_viaje_id uuid, p_pasajeros jsonb, p_parada text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_usuario uuid := auth.uid();
    v_viaje public.viajes%rowtype;
    v_cooperativa uuid;
    v_parada text := btrim(coalesce(p_parada, ''));
    v_parada_id bigint;
    v_parada_nombre text;
    v_preparado jsonb;
    v_compra uuid;
    v_pasajero jsonb;
    v_boletos jsonb;
begin
    v_viaje := public._mi_viaje_asignado(p_viaje_id);
    perform public._exigir_viaje_en_curso(v_viaje.estado_operativo);

    select b.cooperativa_id into v_cooperativa from public.buses as b where b.id = v_viaje.bus_id;

    if v_parada = '' then
        raise exception 'Elige la parada donde sube el pasajero.' using errcode = '23514';
    end if;

    if v_parada = 'origen' then
        select f.origen into v_parada_nombre from public.frecuencias as f where f.id = v_viaje.frecuencia_id;
    elsif v_parada ~ '^[0-9]{1,18}$' then
        select p.id, p.nombre into v_parada_id, v_parada_nombre
        from public.paradas as p
        where p.id = v_parada::bigint
          and p.frecuencia_id = v_viaje.frecuencia_id;
    end if;

    if v_parada_nombre is null then
        raise exception 'Esa parada no pertenece a la ruta de este viaje. Actualiza la página.' using errcode = '23514';
    end if;

    v_parada_nombre := left(btrim(v_parada_nombre), 80);

    -- De 1 a 10 pasajeros, tarifa activa, cédula y nombres válidos.
    -- Precio: el completo del viaje con el descuento de la tarifa (opción A).
    v_preparado := public._preparar_pasajeros(p_viaje_id, p_pasajeros);

    insert into public.compras (
        viaje_id, cooperativa_id, vendedor_id, metodo_pago, estado, origen,
        subtotal, descuento, total, validado_por, validado_en
    )
    values (
        p_viaje_id, v_cooperativa, v_usuario, 'efectivo', 'aprobada', 'EN_RUTA',
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
            pasajero_apellidos, tipo_pasajero, precio, estado, codigo,
            abordado_en, abordado_por, parada_id, parada_subida
        )
        values (
            v_compra, p_viaje_id,
            (v_pasajero ->> 'numero_asiento')::smallint,
            v_pasajero ->> 'cedula',
            v_pasajero ->> 'nombres',
            v_pasajero ->> 'apellidos',
            v_pasajero ->> 'tipo',
            (v_pasajero ->> 'precio')::numeric,
            -- El pasajero ya está en el bus.
            'abordado',
            public._codigo_boleto(),
            now(), v_usuario, v_parada_id, v_parada_nombre
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
        'origen', 'EN_RUTA',
        'emitido_en', now(),
        'parada', v_parada_nombre,
        'subtotal', (v_preparado ->> 'subtotal')::numeric,
        'total', (v_preparado ->> 'total')::numeric,
        'boletos', v_boletos
    );
exception
    when unique_violation then
        raise exception 'Uno o más asientos acaban de ser ocupados. Revisa el mapa e inténtalo de nuevo.'
            using errcode = '23505';
end;
$function$;

-- ---------------------------------------------------------------------
-- 8. Recaudación en camino e historial
-- ---------------------------------------------------------------------
create or replace function public.recaudacion_en_ruta(p_viaje_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
    perform public._exigir_lector_del_viaje(p_viaje_id);

    return jsonb_build_object(
        'viaje', public._datos_viaje_operacion(p_viaje_id),
        'generado_en', now(),
        'lineas', coalesce((
            select jsonb_agg(jsonb_build_object(
                'vendido_en', co.creado_en,
                'codigo', bo.codigo,
                'numero_asiento', bo.numero_asiento,
                'pasajero', bo.pasajero_apellidos || ' ' || bo.pasajero_nombres,
                'cedula', bo.pasajero_cedula,
                'tipo', bo.tipo_pasajero,
                'tarifa', coalesce(tp.nombre, bo.tipo_pasajero),
                'parada', bo.parada_subida,
                'precio', bo.precio
            ) order by co.creado_en, bo.numero_asiento)
            from public.boletos as bo
            join public.compras as co on co.id = bo.compra_id
            left join public.tipos_pasajero as tp on tp.codigo = bo.tipo_pasajero
            where bo.viaje_id = p_viaje_id
              and co.origen = 'EN_RUTA'
              and bo.estado <> 'anulado'
        ), '[]'::jsonb)
    );
end;
$function$;

create or replace function public.recaudacion_de_cooperativa(p_cooperativa_id uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
    perform public.exigir_despachador(p_cooperativa_id);
    perform public._revisar_rango_fechas(p_desde, p_hasta);

    return jsonb_build_object(
        'desde', p_desde,
        'hasta', p_hasta,
        'viajes', coalesce((
            select jsonb_agg(public._datos_viaje_operacion(v.id) order by v.fecha desc, f.hora desc)
            from public.viajes as v
            join public.frecuencias as f on f.id = v.frecuencia_id
            join public.buses as b on b.id = v.bus_id
            where b.cooperativa_id = p_cooperativa_id
              and v.fecha between p_desde and p_hasta
              and v.estado_operativo in ('en_curso', 'finalizado')
        ), '[]'::jsonb)
    );
end;
$function$;

create or replace function public.historial_viajes_bus(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
    if auth.uid() is null or public.rol_actual() is distinct from 'bus' then
        raise exception 'Solo un usuario bus tiene historial de viajes.' using errcode = '42501';
    end if;

    perform public._revisar_rango_fechas(p_desde, p_hasta);

    return jsonb_build_object(
        'desde', p_desde,
        'hasta', p_hasta,
        'viajes', coalesce((
            select jsonb_agg(public._datos_viaje_operacion(v.id) order by v.fecha desc, f.hora desc)
            from public.viajes as v
            join public.frecuencias as f on f.id = v.frecuencia_id
            where v.usuario_bus_id = auth.uid()
              and v.fecha between p_desde and p_hasta
              and v.estado_operativo <> 'programado'
        ), '[]'::jsonb)
    );
end;
$function$;

-- ---------------------------------------------------------------------
-- 9. Lectura de boletos y Realtime (mapa en tiempo real)
-- ---------------------------------------------------------------------
-- Se suma a "ver boletos de compras visibles" (cliente, oficinista,
-- gerente y administrador no cambian). Realtime respeta esta lectura.
drop policy if exists "usuario bus ve boletos de sus viajes" on public.boletos;
create policy "usuario bus ve boletos de sus viajes"
    on public.boletos for select
    to authenticated
    using (
        (select public.rol_actual()) = 'bus'
        and public.es_viaje_asignado_a_mi(viaje_id)
    );

do $$
begin
    if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        create publication supabase_realtime;
    end if;

    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'boletos'
    ) then
        alter publication supabase_realtime add table public.boletos;
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Permisos de las funciones
-- ---------------------------------------------------------------------
do $$
declare
    v_funcion text;
begin
    foreach v_funcion in array array[
        'public.mis_viajes_de_hoy()',
        'public.iniciar_viaje(uuid)',
        'public.finalizar_viaje(uuid)',
        'public.mapa_del_viaje(uuid)',
        'public.manifiesto_del_viaje(uuid)',
        'public.validar_boleto(uuid, text, uuid)',
        'public.vender_en_ruta(uuid, jsonb, text)',
        'public.recaudacion_en_ruta(uuid)',
        'public.recaudacion_de_cooperativa(uuid, date, date)',
        'public.historial_viajes_bus(date, date)',
        'public.es_viaje_asignado_a_mi(uuid)'
    ]
    loop
        execute format('revoke all on function %s from public, anon', v_funcion);
        execute format('grant execute on function %s to authenticated', v_funcion);
    end loop;

    foreach v_funcion in array array[
        'public._mi_viaje_asignado(uuid)',
        'public._exigir_viaje_en_curso(text)',
        'public._datos_viaje_operacion(uuid)',
        'public._exigir_lector_del_viaje(uuid)',
        'public._revisar_rango_fechas(date, date)'
    ]
    loop
        execute format('revoke all on function %s from public, anon, authenticated', v_funcion);
    end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;

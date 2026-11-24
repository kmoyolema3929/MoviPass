-- =====================================================================
-- Cambio 11 (emergencia): el baño no es un asiento.
--
-- Parte de la versión que está en la nube (no de las migraciones antiguas
-- del repositorio). Las funciones que cambian se escriben completas.
--
-- Formato (plantillas_bus.distribucion), dentro de cada piso:
--   "celdas_especiales": [{ "fila": 10, "columna": 4, "tipo": "bano" }]
-- - Solo se guarda si el piso tiene baño: las plantillas actuales no cambian.
-- - "cantidad" sigue siendo el número de celdas de la cuadrícula; cada celda
--   de baño deja de ser asiento, así que la capacidad baja y la cuadrícula
--   no cambia de tamaño.
-- - Más adelante se podrán aceptar otros tipos (puerta, escalera, cabina,
--   pasillo) con el mismo formato.
--
-- Qué cambia:
--   1. validar_distribucion_plantilla: valida las celdas de baño y calcula la
--      capacidad sin contarlas.
--   2. asientos_de_distribucion (nueva): numera los asientos saltando el baño.
--   3. generar_asientos_plantilla: crea los asientos con la función anterior.
--      Como public.asientos es una vista sobre plantilla_asientos, el baño no
--      aparece en la venta y _preparar_pasajeros rechaza venderlo.
--   4. exigir_boletos_sin_cambios (nueva): detiene el cambio si un boleto
--      vendido de un viaje pendiente queda en el baño o cambia de posición, y
--      dice cuáles son (fecha del viaje, bus, asiento y código).
--   5. guardar_plantilla_bus y guardar_plantilla_individual: la capacidad no
--      cuenta el baño y llaman a la revisión de boletos.
--   La revisión de boletos y bus_tiene_boletos_pendientes cuentan los viajes
--   pendientes con la fecha de Ecuador (America/Guayaquil), no la de UTC.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Validar la distribución (ahora con celdas de baño)
-- ---------------------------------------------------------------------
create or replace function public.validar_distribucion_plantilla(p_distribucion jsonb)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
    v_numero_pisos int;
    v_indice int;
    v_piso jsonb;
    v_campo text;
    v_valor numeric;
    v_limite int;
    v_cantidad int;
    v_filas int;
    v_columnas int;
    v_central boolean;
    v_total int := 0;
    v_distribucion jsonb := '[]'::jsonb;
    v_celda jsonb;
    v_celdas jsonb;
    v_fila_celda int;
    v_columna_celda int;
    v_tipo_celda text;
    v_existe boolean;
    v_objeto jsonb;
begin
    if jsonb_typeof(p_distribucion) is distinct from 'array' then
        raise exception 'La distribución debe ser una lista de pisos.'
            using errcode = '22023';
    end if;

    v_numero_pisos := jsonb_array_length(p_distribucion);

    if v_numero_pisos not in (1, 2) then
        raise exception 'El bus debe tener uno o dos pisos.'
            using errcode = '22023';
    end if;

    for v_indice in 0..(v_numero_pisos - 1) loop
        v_piso := p_distribucion -> v_indice;

        if jsonb_typeof(v_piso) is distinct from 'object' then
            raise exception 'La configuración del piso % no es válida.',
                v_indice + 1
                using errcode = '22023';
        end if;

        foreach v_campo in array array['cantidad', 'filas', 'columnas']
        loop
            if jsonb_typeof(v_piso -> v_campo) is distinct from 'number' then
                raise exception 'El campo % del piso % debe ser numérico.',
                    v_campo, v_indice + 1
                    using errcode = '22023';
            end if;

            v_valor := (v_piso ->> v_campo)::numeric;
            v_limite := case when v_campo = 'columnas' then 4 else 60 end;

            if v_valor <> trunc(v_valor)
               or v_valor < 1
               or v_valor > v_limite then
                raise exception
                    'El campo % del piso % debe ser un entero entre 1 y %.',
                    v_campo, v_indice + 1, v_limite
                    using errcode = '22023';
            end if;
        end loop;

        if (v_piso -> 'ultima_fila_5') is not null
           and jsonb_typeof(v_piso -> 'ultima_fila_5') <> 'boolean' then
            raise exception 'El campo ultima_fila_5 del piso % debe ser verdadero o falso.',
                v_indice + 1
                using errcode = '22023';
        end if;

        v_cantidad := (v_piso ->> 'cantidad')::numeric::integer;
        v_filas := (v_piso ->> 'filas')::numeric::integer;
        v_columnas := (v_piso ->> 'columnas')::numeric::integer;
        v_central := coalesce((v_piso ->> 'ultima_fila_5')::boolean, false);

        if v_central then
            if v_columnas <> 4
               or v_cantidad < 5
               or (v_cantidad - 1) % 4 <> 0
               or v_filas <> (v_cantidad - 1) / 4 then
                raise exception
                    'La última fila de 5 asientos (piso %) requiere 4 asientos por fila y una cantidad de 5, 9, 13... (4 × filas + 1).',
                    v_indice + 1
                    using errcode = '22023';
            end if;
        elsif v_filas <> (v_cantidad + v_columnas - 1) / v_columnas then
            raise exception
                'Las filas del piso % no corresponden a su cantidad de asientos y columnas.',
                v_indice + 1
                using errcode = '22023';
        end if;

        -- Celdas de baño (nuevo): deben existir en la cuadrícula y no repetirse.
        if (v_piso -> 'celdas_especiales') is not null
           and jsonb_typeof(v_piso -> 'celdas_especiales') <> 'array' then
            raise exception 'Las celdas especiales del piso % deben ser una lista.',
                v_indice + 1
                using errcode = '22023';
        end if;

        v_celdas := '[]'::jsonb;

        for v_celda in
            select e.value
            from jsonb_array_elements(
                coalesce(v_piso -> 'celdas_especiales', '[]'::jsonb)
            ) as e
        loop
            if jsonb_typeof(v_celda) is distinct from 'object'
               or jsonb_typeof(v_celda -> 'fila') is distinct from 'number'
               or jsonb_typeof(v_celda -> 'columna') is distinct from 'number'
               or jsonb_typeof(v_celda -> 'tipo') is distinct from 'string'
               or (v_celda ->> 'fila')::numeric <> trunc((v_celda ->> 'fila')::numeric)
               or (v_celda ->> 'columna')::numeric <> trunc((v_celda ->> 'columna')::numeric) then
                raise exception 'Una celda especial del piso % no es válida.',
                    v_indice + 1
                    using errcode = '22023';
            end if;

            v_fila_celda := (v_celda ->> 'fila')::numeric::integer;
            v_columna_celda := (v_celda ->> 'columna')::numeric::integer;
            v_tipo_celda := v_celda ->> 'tipo';

            -- Por ahora solo el baño. Los demás tipos llegarán en otro cambio.
            if v_tipo_celda not in ('bano') then
                raise exception 'El tipo de celda «%» del piso % no es válido.',
                    v_tipo_celda, v_indice + 1
                    using errcode = '22023';
            end if;

            if v_central then
                v_existe := v_fila_celda between 1 and v_filas
                    and v_columna_celda between 1 and
                        case when v_fila_celda = v_filas then 5 else 4 end;
            else
                v_existe := v_fila_celda >= 1
                    and v_columna_celda between 1 and v_columnas
                    and (v_fila_celda - 1) * v_columnas + v_columna_celda <= v_cantidad;
            end if;

            if not v_existe then
                raise exception
                    'El baño del piso % (fila %, columna %) está fuera de la distribución.',
                    v_indice + 1, v_fila_celda, v_columna_celda
                    using errcode = '22023';
            end if;

            if exists (
                select 1
                from jsonb_array_elements(v_celdas) as x
                where (x.value ->> 'fila')::int = v_fila_celda
                  and (x.value ->> 'columna')::int = v_columna_celda
            ) then
                raise exception
                    'La celda de la fila %, columna % del piso % está repetida.',
                    v_fila_celda, v_columna_celda, v_indice + 1
                    using errcode = '22023';
            end if;

            v_celdas := v_celdas || jsonb_build_array(
                jsonb_build_object(
                    'fila', v_fila_celda,
                    'columna', v_columna_celda,
                    'tipo', v_tipo_celda
                )
            );
        end loop;

        if jsonb_array_length(v_celdas) >= v_cantidad then
            raise exception 'El piso % debe tener al menos un asiento.',
                v_indice + 1
                using errcode = '22023';
        end if;

        -- Orden fijo para que dos distribuciones iguales se comparen iguales.
        select coalesce(
                   jsonb_agg(x.value order by (x.value ->> 'fila')::int,
                                              (x.value ->> 'columna')::int),
                   '[]'::jsonb
               )
          into v_celdas
        from jsonb_array_elements(v_celdas) as x;

        -- El baño no cuenta en la capacidad.
        v_total := v_total + v_cantidad - jsonb_array_length(v_celdas);

        v_objeto := jsonb_build_object(
            'numero', v_indice + 1,
            'cantidad', v_cantidad,
            'filas', v_filas,
            'columnas', v_columnas,
            'ultima_fila_5', v_central
        );

        -- Sin baño no se guarda la lista: las plantillas actuales quedan iguales.
        if jsonb_array_length(v_celdas) > 0 then
            v_objeto := v_objeto || jsonb_build_object('celdas_especiales', v_celdas);
        end if;

        v_distribucion := v_distribucion || jsonb_build_array(v_objeto);
    end loop;

    if v_total > 60
       or (v_numero_pisos = 2 and v_total < 40) then
        raise exception
            'Capacidad inválida: máximo 60 asientos; en dos pisos, entre 40 y 60 (el baño no cuenta).'
            using errcode = '22023';
    end if;

    return v_distribucion;
end;
$function$;

-- ---------------------------------------------------------------------
-- 2. Asientos de una distribución, numerados en orden y sin el baño
--    (misma ubicación por fila y columna que antes).
-- ---------------------------------------------------------------------
create or replace function public.asientos_de_distribucion(p_distribucion jsonb)
returns table (numero integer, piso integer, fila integer, columna integer, tipo text)
language sql
immutable
set search_path to ''
as $function$
    with pisos as (
        select
            (d.orden - 1)::int as indice,
            d.datos,
            (d.datos ->> 'cantidad')::int as cantidad,
            (d.datos ->> 'filas')::int as filas,
            (d.datos ->> 'columnas')::int as columnas,
            coalesce((d.datos ->> 'ultima_fila_5')::boolean, false) as central,
            jsonb_array_length(p_distribucion) as numero_pisos
        from jsonb_array_elements(p_distribucion) with ordinality as d(datos, orden)
    ),
    celdas as (
        select
            p.indice,
            p.numero_pisos,
            p.datos,
            s.pos,
            case
                when p.central and s.pos > (p.filas - 1) * 4 then p.filas
                else ((s.pos - 1) / p.columnas) + 1
            end as fila,
            case
                when p.central and s.pos > (p.filas - 1) * 4 then s.pos - (p.filas - 1) * 4
                else ((s.pos - 1) % p.columnas) + 1
            end as columna
        from pisos as p
        cross join lateral pg_catalog.generate_series(1, p.cantidad) as s(pos)
    ),
    sin_bano as (
        select c.*
        from celdas as c
        where not exists (
            select 1
            from jsonb_array_elements(
                coalesce(c.datos -> 'celdas_especiales', '[]'::jsonb)
            ) as e
            where (e.value ->> 'fila')::int = c.fila
              and (e.value ->> 'columna')::int = c.columna
        )
    )
    select
        (row_number() over (order by a.indice, a.pos))::int,
        a.indice + 1,
        a.fila,
        a.columna,
        case when a.numero_pisos = 2 and a.indice = 0 then 'vip' else 'normal' end
    from sin_bano as a
    order by a.indice, a.pos;
$function$;

-- ---------------------------------------------------------------------
-- 3. Generar los asientos de la plantilla (sin el baño)
-- ---------------------------------------------------------------------
create or replace function public.generar_asientos_plantilla(p_plantilla_id uuid, p_distribucion jsonb)
returns void
language plpgsql
set search_path to ''
as $function$
begin
    delete from public.plantilla_asientos as pa
    where pa.plantilla_id = p_plantilla_id;

    insert into public.plantilla_asientos (
        plantilla_id, numero, piso, fila, columna, tipo
    )
    select
        p_plantilla_id,
        a.numero,
        a.piso,
        a.fila,
        a.columna,
        a.tipo
    from public.asientos_de_distribucion(p_distribucion) as a;
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. Boletos vendidos que quedarían en el baño o en otra posición
--    p_plantilla_actual: plantilla que usan hoy los buses.
--    p_bus_id: un solo bus (plantilla propia) o null (todos los buses de la plantilla).
-- ---------------------------------------------------------------------
create or replace function public.exigir_boletos_sin_cambios(
    p_plantilla_actual uuid,
    p_bus_id uuid,
    p_distribucion jsonb
)
returns void
language plpgsql
stable
set search_path to ''
as $function$
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
                case
                    when exists (
                        select 1
                        from jsonb_array_elements(
                            coalesce(
                                p_distribucion -> (pa.piso - 1) -> 'celdas_especiales',
                                '[]'::jsonb
                            )
                        ) as e
                        where (e.value ->> 'fila')::int = pa.fila
                          and (e.value ->> 'columna')::int = pa.columna
                    ) then 'su lugar pasaría a ser baño'
                    when n.numero is null then 'el asiento dejaría de existir'
                    else 'el asiento cambiaría de lugar'
                end
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
          and bo.estado in ('reservado', 'emitido')
          -- Fecha de Ecuador (la base trabaja en UTC).
          and v.fecha >= (now() at time zone 'America/Guayaquil')::date
          and (
              n.numero is null
              or (n.piso, n.fila, n.columna)
                 is distinct from (pa.piso::int, pa.fila::int, pa.columna::int)
          )
    ) as af;

    if v_cantidad > 0 then
        raise exception '%',
            'No se puede cambiar la distribución: ' || v_cantidad ||
            case when v_cantidad = 1
                then ' boleto vendido en un viaje pendiente quedaría en el baño o en otro lugar. '
                else ' boletos vendidos en viajes pendientes quedarían en el baño o en otro lugar. '
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

-- ---------------------------------------------------------------------
-- 4b. ¿El bus tiene boletos en viajes pendientes? (versión de la nube)
--     Único cambio: "pendiente" se cuenta con la fecha de Ecuador, igual
--     que en exigir_boletos_sin_cambios.
-- ---------------------------------------------------------------------
create or replace function public.bus_tiene_boletos_pendientes(p_bus_id uuid)
returns boolean
language sql
stable
set search_path to ''
as $function$
    select exists (
        select 1
        from public.boletos as bo
        join public.viajes as v on v.id = bo.viaje_id
        where v.bus_id = p_bus_id
          and bo.estado in ('reservado', 'emitido')
          and v.fecha >= (now() at time zone 'America/Guayaquil')::date
    );
$function$;

-- Funciones internas: solo las usan las funciones de guardado.
revoke all on function public.asientos_de_distribucion(jsonb)
    from public, anon, authenticated;
revoke all on function public.exigir_boletos_sin_cambios(uuid, uuid, jsonb)
    from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5a. Guardar la plantilla de un tipo de bus
--     Cambios: capacidad sin baño y revisión de boletos antes de regenerar.
-- ---------------------------------------------------------------------
create or replace function public.guardar_plantilla_bus(
    p_cooperativa_id uuid,
    p_tipo_bus text,
    p_distribucion jsonb,
    p_actualizado_en_esperado timestamp with time zone default null::timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_tipo text := trim(coalesce(p_tipo_bus, ''));
    v_numero_pisos int;
    v_total int;
    v_distribucion jsonb;
    v_ahora timestamptz;
    v_plantilla public.plantillas_bus%rowtype;
    v_cambio boolean := true;
    v_buses int;
begin
    perform public.exigir_gestion_plantillas(p_cooperativa_id);

    if length(v_tipo) = 0 or length(v_tipo) > 60 then
        raise exception 'Indica el tipo de bus (máximo 60 caracteres).'
            using errcode = '22023';
    end if;

    v_distribucion := public.validar_distribucion_plantilla(p_distribucion);
    v_numero_pisos := jsonb_array_length(v_distribucion);

    -- El baño no cuenta como asiento.
    select coalesce(sum(
               (e ->> 'cantidad')::int
               - coalesce(jsonb_array_length(e -> 'celdas_especiales'), 0)
           ), 0)
      into v_total
    from jsonb_array_elements(v_distribucion) as e;

    select pb.*
      into v_plantilla
    from public.plantillas_bus as pb
    where pb.cooperativa_id = p_cooperativa_id
      and pb.bus_id is null
      and lower(trim(pb.tipo_bus)) = lower(v_tipo)
    for update;

    if found then
        if p_actualizado_en_esperado is null
           or v_plantilla.actualizado_en
              is distinct from p_actualizado_en_esperado then
            raise exception
                'La plantilla cambió desde que la abriste. Vuelve a cargarla antes de guardar.'
                using errcode = '40001';
        end if;

        v_cambio := not (
            v_plantilla.numero_pisos = v_numero_pisos
            and v_plantilla.total_asientos = v_total
            and v_plantilla.distribucion = v_distribucion
        );

        -- Antes de tocar nada: ningún boleto vendido puede quedar en el baño
        -- ni cambiar de lugar en los buses que usan esta plantilla.
        if v_cambio then
            perform public.exigir_boletos_sin_cambios(
                v_plantilla.id, null, v_distribucion
            );
        end if;

        if v_cambio or v_plantilla.tipo_bus <> v_tipo then
            v_ahora := clock_timestamp();

            if v_ahora <= v_plantilla.actualizado_en then
                v_ahora := v_plantilla.actualizado_en + interval '1 microsecond';
            end if;

            update public.plantillas_bus as pb
            set tipo_bus = v_tipo,
                numero_pisos = v_numero_pisos,
                total_asientos = v_total,
                distribucion = v_distribucion,
                actualizado_en = v_ahora
            where pb.id = v_plantilla.id
            returning pb.* into v_plantilla;
        end if;
    else
        if p_actualizado_en_esperado is not null then
            raise exception
                'La plantilla anterior ya no existe. Vuelve a cargar el tipo de bus.'
                using errcode = '40001';
        end if;

        insert into public.plantillas_bus (
            cooperativa_id, tipo_bus, numero_pisos,
            total_asientos, distribucion, actualizado_en
        )
        values (
            p_cooperativa_id, v_tipo, v_numero_pisos,
            v_total, v_distribucion, clock_timestamp()
        )
        returning * into v_plantilla;
    end if;

    if v_cambio then
        perform public.generar_asientos_plantilla(v_plantilla.id, v_distribucion);
    end if;

    update public.buses as b
    set plantilla_id = v_plantilla.id
    where b.cooperativa_id = p_cooperativa_id
      and lower(trim(b.tipo_bus)) = lower(v_tipo)
      and b.plantilla_id is distinct from v_plantilla.id
      and not exists (
          select 1 from public.plantillas_bus as pi
          where pi.bus_id = b.id
      );

    select count(*)
      into v_buses
    from public.buses as b
    where b.plantilla_id = v_plantilla.id;

    return to_jsonb(v_plantilla)
        || jsonb_build_object('buses_asignados', v_buses);
end;
$function$;

-- ---------------------------------------------------------------------
-- 5b. Guardar la plantilla propia de un bus
--     Cambios: capacidad sin baño y lista de boletos afectados. Se mantiene
--     la regla que ya existía: con boletos pendientes no se cambia la
--     distribución del bus.
-- ---------------------------------------------------------------------
create or replace function public.guardar_plantilla_individual(
    p_cooperativa_id uuid,
    p_bus_id uuid,
    p_distribucion jsonb,
    p_actualizado_en_esperado timestamp with time zone default null::timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_bus public.buses%rowtype;
    v_numero_pisos int;
    v_total int;
    v_distribucion jsonb;
    v_actual jsonb;
    v_ahora timestamptz;
    v_plantilla public.plantillas_bus%rowtype;
    v_existe boolean;
    v_cambio boolean := true;
begin
    perform public.exigir_gestion_plantillas(p_cooperativa_id);

    select b.* into v_bus
    from public.buses as b
    where b.id = p_bus_id
      and b.cooperativa_id = p_cooperativa_id
    for update;

    if not found then
        raise exception 'El bus no existe en esta cooperativa.'
            using errcode = '22023';
    end if;

    v_distribucion := public.validar_distribucion_plantilla(p_distribucion);
    v_numero_pisos := jsonb_array_length(v_distribucion);

    -- El baño no cuenta como asiento.
    select coalesce(sum(
               (e ->> 'cantidad')::int
               - coalesce(jsonb_array_length(e -> 'celdas_especiales'), 0)
           ), 0)
      into v_total
    from jsonb_array_elements(v_distribucion) as e;

    select pb.* into v_plantilla
    from public.plantillas_bus as pb
    where pb.bus_id = p_bus_id
    for update;

    v_existe := found;

    if v_existe then
        if p_actualizado_en_esperado is null
           or v_plantilla.actualizado_en
              is distinct from p_actualizado_en_esperado then
            raise exception
                'La plantilla cambió desde que la abriste. Vuelve a cargarla antes de guardar.'
                using errcode = '40001';
        end if;

        v_cambio := not (
            v_plantilla.numero_pisos = v_numero_pisos
            and v_plantilla.total_asientos = v_total
            and v_plantilla.distribucion = v_distribucion
        );
    elsif p_actualizado_en_esperado is not null then
        raise exception
            'La plantilla del bus ya no existe. Vuelve a cargar el bus.'
            using errcode = '40001';
    end if;

    select pb.distribucion into v_actual
    from public.plantillas_bus as pb
    where pb.id = v_bus.plantilla_id;

    if v_actual is distinct from v_distribucion then
        -- Primero, los boletos que quedarían en el baño o en otro lugar (con su lista).
        perform public.exigir_boletos_sin_cambios(
            v_bus.plantilla_id, p_bus_id, v_distribucion
        );

        if public.bus_tiene_boletos_pendientes(p_bus_id) then
            raise exception
                'El bus % tiene boletos reservados o emitidos en viajes pendientes. No se puede cambiar su distribución de asientos.',
                v_bus.placa
                using errcode = '55006';
        end if;
    end if;

    if v_existe then
        if v_cambio then
            v_ahora := clock_timestamp();

            if v_ahora <= v_plantilla.actualizado_en then
                v_ahora := v_plantilla.actualizado_en + interval '1 microsecond';
            end if;

            update public.plantillas_bus as pb
            set numero_pisos = v_numero_pisos,
                total_asientos = v_total,
                distribucion = v_distribucion,
                actualizado_en = v_ahora
            where pb.id = v_plantilla.id
            returning pb.* into v_plantilla;
        end if;
    else
        insert into public.plantillas_bus (
            cooperativa_id, bus_id, tipo_bus, numero_pisos,
            total_asientos, distribucion, actualizado_en
        )
        values (
            p_cooperativa_id, p_bus_id, v_bus.tipo_bus, v_numero_pisos,
            v_total, v_distribucion, clock_timestamp()
        )
        returning * into v_plantilla;
    end if;

    if v_cambio then
        perform public.generar_asientos_plantilla(v_plantilla.id, v_distribucion);
    end if;

    update public.buses as b
    set plantilla_id = v_plantilla.id
    where b.id = p_bus_id
      and b.plantilla_id is distinct from v_plantilla.id;

    return to_jsonb(v_plantilla)
        || jsonb_build_object('buses_asignados', 1);
end;
$function$;

-- Refrescar la caché de esquema de la API.
notify pgrst, 'reload schema';

commit;

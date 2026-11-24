-- =====================================================================
-- Cambio 6, parte 2 (ajuste): asiento bloqueado y espacio vacío
--
-- La migración 20261115090000_mis_plantillas.sql ya está aplicada; esta
-- parte de sus funciones y solo agrega:
--   1. Tipo de asiento "bloqueado": existe en el bus y conserva su número
--      (1 a 60, sin repetir, como los demás), pero no se vende y no cuenta
--      en la capacidad (plantillas_bus.total_asientos = asientos a la venta).
--      Aparece en la vista "asientos" para que los mapas lo dibujen.
--   2. Celda "vacio" (espacio vacío): no es asiento ni pasillo; permite filas
--      de distinto ancho dentro de la misma cuadrícula (máximo 8 columnas).
--   3. Protección de boletos (fecha de Ecuador): un asiento vendido en un
--      viaje pendiente tampoco puede pasar a bloqueado.
--   4. Disparador en boletos: nadie puede vender un asiento bloqueado
--      (cliente, oficinista ni chofer), ni cambiar un boleto a ese asiento.
--   Las plantillas guardadas no cambian (no tienen bloqueados ni vacíos).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Asientos de plantilla: tipo "bloqueado"
-- ---------------------------------------------------------------------
alter table public.plantilla_asientos drop constraint if exists plantilla_asientos_tipo_check;
alter table public.plantilla_asientos
    add constraint plantilla_asientos_tipo_check
        check (tipo in ('normal', 'vip', 'cama', 'bloqueado'));

-- ---------------------------------------------------------------------
-- 2. Validar una distribución (igual que en la parte 2, más "bloqueado",
--    "vacio" y la capacidad contada solo con asientos a la venta).
-- ---------------------------------------------------------------------
create or replace function public.validar_distribucion_plantilla(p_distribucion jsonb)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $function$
declare
    v_numero_pisos int;
    v_formato2 int;
    v_indice int;
    v_piso jsonb;
    v_filas int;
    v_columnas int;
    v_campo text;
    v_valor numeric;
    v_limite int;
    v_elemento jsonb;
    v_fila int;
    v_columna int;
    v_tipo text;
    v_numero int;
    v_ocupadas text[];
    v_especiales jsonb;
    v_asientos jsonb;
    v_numeros int[] := '{}';
    v_total int := 0;
    v_resultado jsonb := '[]'::jsonb;
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
        if jsonb_typeof(p_distribucion -> v_indice) is distinct from 'object' then
            raise exception 'La configuración del piso % no es válida.',
                v_indice + 1
                using errcode = '22023';
        end if;
    end loop;

    select count(*) into v_formato2
    from jsonb_array_elements(p_distribucion) as d
    where (d.value ->> 'formato') = '2';

    -- Formato antiguo: mismas reglas de siempre y se convierte.
    if v_formato2 = 0 then
        return public.convertir_distribucion_antigua(
            public.validar_distribucion_antigua(p_distribucion)
        );
    end if;

    if v_formato2 <> v_numero_pisos then
        raise exception 'Todos los pisos deben usar el mismo formato.'
            using errcode = '22023';
    end if;

    for v_indice in 0..(v_numero_pisos - 1) loop
        v_piso := p_distribucion -> v_indice;

        foreach v_campo in array array['filas', 'columnas']
        loop
            v_limite := case when v_campo = 'columnas' then 8 else 20 end;

            if jsonb_typeof(v_piso -> v_campo) is distinct from 'number' then
                raise exception 'El campo % del piso % debe ser numérico.',
                    v_campo, v_indice + 1
                    using errcode = '22023';
            end if;

            v_valor := (v_piso ->> v_campo)::numeric;

            if v_valor <> trunc(v_valor) or v_valor < 1 or v_valor > v_limite then
                raise exception 'El piso % debe tener entre 1 y % %.',
                    v_indice + 1, v_limite, v_campo
                    using errcode = '22023';
            end if;
        end loop;

        v_filas := (v_piso ->> 'filas')::numeric::int;
        v_columnas := (v_piso ->> 'columnas')::numeric::int;
        v_ocupadas := '{}';
        v_especiales := '[]'::jsonb;
        v_asientos := '[]'::jsonb;

        if jsonb_typeof(coalesce(v_piso -> 'celdas_especiales', '[]'::jsonb)) <> 'array'
           or jsonb_typeof(coalesce(v_piso -> 'asientos', 'null'::jsonb)) <> 'array' then
            raise exception 'El piso % debe tener la lista de asientos y de celdas especiales.',
                v_indice + 1
                using errcode = '22023';
        end if;

        -- Celdas que no son asiento.
        for v_elemento in
            select e.value
            from jsonb_array_elements(coalesce(v_piso -> 'celdas_especiales', '[]'::jsonb)) as e
        loop
            if jsonb_typeof(v_elemento) is distinct from 'object'
               or jsonb_typeof(v_elemento -> 'fila') is distinct from 'number'
               or jsonb_typeof(v_elemento -> 'columna') is distinct from 'number'
               or jsonb_typeof(v_elemento -> 'tipo') is distinct from 'string'
               or (v_elemento ->> 'fila')::numeric <> trunc((v_elemento ->> 'fila')::numeric)
               or (v_elemento ->> 'columna')::numeric <> trunc((v_elemento ->> 'columna')::numeric) then
                raise exception 'Una celda especial del piso % no es válida.',
                    v_indice + 1
                    using errcode = '22023';
            end if;

            v_fila := (v_elemento ->> 'fila')::numeric::int;
            v_columna := (v_elemento ->> 'columna')::numeric::int;
            v_tipo := v_elemento ->> 'tipo';

            if v_tipo not in ('bano', 'puerta', 'escalera', 'cabina', 'pasillo', 'vacio') then
                raise exception 'El tipo de celda «%» del piso % no es válido.',
                    v_tipo, v_indice + 1
                    using errcode = '22023';
            end if;

            if v_fila not between 1 and v_filas or v_columna not between 1 and v_columnas then
                raise exception 'La celda (fila %, columna %) del piso % está fuera de la cuadrícula.',
                    v_fila, v_columna, v_indice + 1
                    using errcode = '22023';
            end if;

            if (v_fila || '-' || v_columna) = any (v_ocupadas) then
                raise exception 'La celda de la fila %, columna % del piso % está repetida.',
                    v_fila, v_columna, v_indice + 1
                    using errcode = '22023';
            end if;

            v_ocupadas := v_ocupadas || (v_fila || '-' || v_columna);
            v_especiales := v_especiales || jsonb_build_array(
                jsonb_build_object('fila', v_fila, 'columna', v_columna, 'tipo', v_tipo)
            );
        end loop;

        -- Asientos.
        for v_elemento in
            select e.value from jsonb_array_elements(v_piso -> 'asientos') as e
        loop
            if jsonb_typeof(v_elemento) is distinct from 'object'
               or jsonb_typeof(v_elemento -> 'fila') is distinct from 'number'
               or jsonb_typeof(v_elemento -> 'columna') is distinct from 'number'
               or jsonb_typeof(v_elemento -> 'numero') is distinct from 'number'
               or jsonb_typeof(v_elemento -> 'tipo') is distinct from 'string'
               or (v_elemento ->> 'fila')::numeric <> trunc((v_elemento ->> 'fila')::numeric)
               or (v_elemento ->> 'columna')::numeric <> trunc((v_elemento ->> 'columna')::numeric)
               or (v_elemento ->> 'numero')::numeric <> trunc((v_elemento ->> 'numero')::numeric) then
                raise exception 'Un asiento del piso % no es válido.',
                    v_indice + 1
                    using errcode = '22023';
            end if;

            v_fila := (v_elemento ->> 'fila')::numeric::int;
            v_columna := (v_elemento ->> 'columna')::numeric::int;
            v_numero := (v_elemento ->> 'numero')::numeric::int;
            v_tipo := v_elemento ->> 'tipo';

            if v_tipo not in ('normal', 'vip', 'cama', 'bloqueado') then
                raise exception 'El tipo de asiento «%» del piso % no es válido.',
                    v_tipo, v_indice + 1
                    using errcode = '22023';
            end if;

            if v_fila not between 1 and v_filas or v_columna not between 1 and v_columnas then
                raise exception 'El asiento % del piso % está fuera de la cuadrícula.',
                    v_numero, v_indice + 1
                    using errcode = '22023';
            end if;

            if (v_fila || '-' || v_columna) = any (v_ocupadas) then
                raise exception 'La celda de la fila %, columna % del piso % está repetida.',
                    v_fila, v_columna, v_indice + 1
                    using errcode = '22023';
            end if;

            if v_numero not between 1 and 60 then
                raise exception 'El número de asiento % no es válido: usa números del 1 al 60.',
                    v_numero
                    using errcode = '22023';
            end if;

            if v_numero = any (v_numeros) then
                raise exception 'El número de asiento % está repetido.',
                    v_numero
                    using errcode = '22023';
            end if;

            v_ocupadas := v_ocupadas || (v_fila || '-' || v_columna);
            v_numeros := v_numeros || v_numero;
            v_asientos := v_asientos || jsonb_build_array(
                jsonb_build_object('fila', v_fila, 'columna', v_columna, 'numero', v_numero, 'tipo', v_tipo)
            );
        end loop;

        if jsonb_array_length(v_asientos) = 0 then
            raise exception 'El piso % debe tener al menos un asiento.',
                v_indice + 1
                using errcode = '22023';
        end if;

        if cardinality(v_ocupadas) <> v_filas * v_columnas then
            raise exception 'Hay celdas sin definir en el piso %.',
                v_indice + 1
                using errcode = '22023';
        end if;

        -- Solo los asientos a la venta cuentan en la capacidad.
        select v_total + count(*) into v_total
        from jsonb_array_elements(v_asientos) as x
        where x.value ->> 'tipo' <> 'bloqueado';

        -- Orden fijo para que dos distribuciones iguales se comparen iguales.
        select coalesce(jsonb_agg(x.value order by (x.value ->> 'fila')::int, (x.value ->> 'columna')::int), '[]'::jsonb)
          into v_especiales
        from jsonb_array_elements(v_especiales) as x;

        select coalesce(jsonb_agg(x.value order by (x.value ->> 'fila')::int, (x.value ->> 'columna')::int), '[]'::jsonb)
          into v_asientos
        from jsonb_array_elements(v_asientos) as x;

        v_resultado := v_resultado || jsonb_build_array(
            jsonb_build_object(
                'numero', v_indice + 1,
                'formato', 2,
                'filas', v_filas,
                'columnas', v_columnas,
                'cantidad', v_filas * v_columnas,
                'celdas_especiales', v_especiales,
                'asientos', v_asientos
            )
        );
    end loop;

    if v_total = 0 then
        raise exception 'La plantilla debe tener al menos un asiento a la venta.'
            using errcode = '22023';
    end if;

    if v_total > 60
       or (v_numero_pisos = 2 and v_total < 40) then
        raise exception
            'Capacidad inválida: máximo 60 asientos; en dos pisos, entre 40 y 60 (solo cuentan los asientos a la venta).'
            using errcode = '22023';
    end if;

    return v_resultado;
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. Boletos vendidos que quedarían fuera de un asiento, bloqueados o en
--    otro lugar (igual que en la parte 2, más "bloqueado" y "vacio").
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
          and bo.estado in ('reservado', 'emitido')
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

-- ---------------------------------------------------------------------
-- 4. Guardar una plantilla (igual que en la parte 2; total_asientos cuenta
--    solo los asientos a la venta).
-- ---------------------------------------------------------------------
create or replace function public.guardar_plantilla(
    p_cooperativa_id uuid,
    p_plantilla_id uuid,
    p_nombre text,
    p_distribucion jsonb,
    p_actualizado_en_esperado timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_nombre text := pg_catalog.regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
    v_distribucion jsonb;
    v_numero_pisos int;
    v_total int;
    v_plantilla public.plantillas_bus%rowtype;
    v_cambio boolean := true;
    v_ahora timestamptz;
    v_buses int;
begin
    perform public.exigir_gestor_de_plantillas(p_cooperativa_id);

    if length(v_nombre) = 0 or length(v_nombre) > 60 then
        raise exception 'Escribe el nombre de la plantilla (máximo 60 caracteres).'
            using errcode = '22023';
    end if;

    if exists (
        select 1 from public.plantillas_bus as pb
        where pb.cooperativa_id = p_cooperativa_id
          and lower(pb.nombre) = lower(v_nombre)
          and pb.id is distinct from p_plantilla_id
    ) then
        raise exception 'Ya tienes una plantilla llamada «%».', v_nombre
            using errcode = '23505';
    end if;

    v_distribucion := public.validar_distribucion_plantilla(p_distribucion);
    v_numero_pisos := jsonb_array_length(v_distribucion);

    -- Capacidad = asientos a la venta (los bloqueados no cuentan).
    select count(*) into v_total
    from public.asientos_de_distribucion(v_distribucion) as a
    where a.tipo <> 'bloqueado';

    if p_plantilla_id is null then
        insert into public.plantillas_bus (
            cooperativa_id, nombre, tipo_bus, numero_pisos,
            total_asientos, distribucion, actualizado_en
        )
        values (
            p_cooperativa_id, v_nombre, v_nombre, v_numero_pisos,
            v_total, v_distribucion, clock_timestamp()
        )
        returning * into v_plantilla;
    else
        select pb.* into v_plantilla
        from public.plantillas_bus as pb
        where pb.id = p_plantilla_id
          and pb.cooperativa_id = p_cooperativa_id
        for update;

        if not found then
            raise exception 'La plantilla ya no existe. Vuelve a cargar la página.'
                using errcode = '40001';
        end if;

        if p_actualizado_en_esperado is null
           or v_plantilla.actualizado_en is distinct from p_actualizado_en_esperado then
            raise exception
                'La plantilla cambió desde que la abriste. Vuelve a cargarla antes de guardar.'
                using errcode = '40001';
        end if;

        v_cambio := not (
            v_plantilla.numero_pisos = v_numero_pisos
            and v_plantilla.total_asientos = v_total
            and v_plantilla.distribucion = v_distribucion
        );

        -- Ningún boleto vendido de un viaje pendiente puede quedar fuera de
        -- un asiento ni cambiar de lugar en los buses que la usan.
        if v_cambio then
            perform public.exigir_boletos_sin_cambios(v_plantilla.id, null, v_distribucion);
        end if;

        if v_cambio or v_plantilla.nombre <> v_nombre then
            v_ahora := clock_timestamp();

            if v_ahora <= v_plantilla.actualizado_en then
                v_ahora := v_plantilla.actualizado_en + interval '1 microsecond';
            end if;

            update public.plantillas_bus as pb
            set nombre = v_nombre,
                numero_pisos = v_numero_pisos,
                total_asientos = v_total,
                distribucion = v_distribucion,
                actualizado_en = v_ahora
            where pb.id = v_plantilla.id
            returning pb.* into v_plantilla;
        end if;
    end if;

    if v_cambio then
        perform public.generar_asientos_plantilla(v_plantilla.id, v_distribucion);
    end if;

    select count(*) into v_buses
    from public.buses as b
    where b.plantilla_id = v_plantilla.id;

    return to_jsonb(v_plantilla) || jsonb_build_object('buses_asignados', v_buses);
exception
    when unique_violation then
        raise exception 'Ya tienes una plantilla llamada «%».', v_nombre
            using errcode = '23505';
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. Un asiento bloqueado no se vende (ninguna pantalla ni función).
-- ---------------------------------------------------------------------
create or replace function public.exigir_asiento_a_la_venta()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
    if exists (
        select 1
        from public.viajes as v
        join public.buses as b
            on b.id = v.bus_id
        join public.plantilla_asientos as pa
            on pa.plantilla_id = b.plantilla_id
           and pa.numero = new.numero_asiento
        where v.id = new.viaje_id
          and pa.tipo = 'bloqueado'
    ) then
        raise exception 'El asiento % no está a la venta (está bloqueado).', new.numero_asiento
            using errcode = '23514';
    end if;

    return new;
end;
$function$;

revoke all on function public.exigir_asiento_a_la_venta() from public, anon, authenticated;

drop trigger if exists boletos_asiento_a_la_venta on public.boletos;
create trigger boletos_asiento_a_la_venta
    before insert or update of numero_asiento, viaje_id
    on public.boletos
    for each row
    execute function public.exigir_asiento_a_la_venta();

notify pgrst, 'reload schema';

commit;

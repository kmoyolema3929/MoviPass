-- =====================================================================
-- Cambio 6, parte 2: "Mis plantillas" y editor visual
--
-- Qué cambia:
--   1. Las plantillas tienen NOMBRE (único en la cooperativa) y ya no van
--      atadas a un tipo de bus ni a un bus. Cada bus usa la plantilla que
--      tiene en buses.plantilla_id; varias pueden compartir una.
--        - Plantilla por tipo  -> se llama como el tipo (= nombre del grupo).
--        - Plantilla propia de un bus (cambio 11) -> "Bus ABC-1234".
--      Ningún bus cambia de plantilla y no se borra ninguna plantilla.
--   2. Formato 2 de la distribución (editor visual). Cada piso guarda su
--      cuadrícula completa:
--        { "numero": 1, "formato": 2, "filas": 11, "columnas": 5,
--          "cantidad": 55,                      -- filas × columnas
--          "celdas_especiales": [{ "fila": 1, "columna": 3, "tipo": "pasillo" }, ...],
--          "asientos": [{ "fila": 1, "columna": 1, "numero": 1, "tipo": "normal" }, ...] }
--      celdas_especiales es el mismo formato del cambio 11 con más tipos:
--      bano, puerta, escalera, cabina y pasillo. Toda celda que no es
--      especial es un asiento (normal, vip o cama) con su número (1 a 60,
--      sin repetir). Como antes, capacidad = cantidad - celdas especiales.
--   3. Las plantillas existentes pasan al formato 2 SIN cambiar ningún
--      número de asiento: el pasillo central que antes era implícito (4
--      columnas) pasa a ser una columna de pasillo. Se ven igual que antes.
--      Si una distribución antigua llega a guardarse, se convierte igual.
--   4. Protección de boletos (fecha de Ecuador): exigir_boletos_sin_cambios
--      revisa también los números cambiados de lugar y cualquier celda que
--      deja de ser asiento. Cambiar la plantilla de un bus (buses.plantilla_id)
--      pasa por la misma revisión.
--   5. Nuevas funciones guardar_plantilla y eliminar_plantilla (no se
--      elimina una plantilla que use algún bus). Las funciones por tipo y por
--      bus del cambio 11 dejan de poder llamarse desde la aplicación.
--   6. Un bus nuevo sin plantilla toma la de igual nombre que su grupo
--      (hasta la parte 3, en la que se elige en el formulario). Cambiar de
--      grupo ya no cambia la plantilla.
--   7. La hoja de ruta exige que el bus tenga plantilla (buses.plantilla_id),
--      ya no que exista una plantilla con el nombre de su tipo.
--
-- Parte de la base en la nube (cambio6-base-nube.txt y cambio11-base-nube.txt).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Asientos de plantilla: hasta 8 columnas y asiento tipo "cama".
--    Se rehacen las reglas (check) de la tabla con nombres conocidos.
-- ---------------------------------------------------------------------
do $$
declare
    v_nombre text;
begin
    for v_nombre in
        select c.conname
        from pg_catalog.pg_constraint as c
        where c.conrelid = 'public.plantilla_asientos'::regclass
          and c.contype = 'c'
    loop
        execute format('alter table public.plantilla_asientos drop constraint %I', v_nombre);
    end loop;
end;
$$;

alter table public.plantilla_asientos
    add constraint plantilla_asientos_numero_check check (numero between 1 and 60),
    add constraint plantilla_asientos_piso_check check (piso in (1, 2)),
    add constraint plantilla_asientos_fila_check check (fila between 1 and 60),
    add constraint plantilla_asientos_columna_check check (columna between 1 and 8),
    add constraint plantilla_asientos_tipo_check check (tipo in ('normal', 'vip', 'cama'));

-- ---------------------------------------------------------------------
-- 2. Validación del formato antiguo (la de la nube, sin cambios de
--    reglas, con otro nombre). Devuelve la distribución antigua ordenada.
-- ---------------------------------------------------------------------
create or replace function public.validar_distribucion_antigua(p_distribucion jsonb)
returns jsonb
language plpgsql
immutable
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
    v_numero_pisos := jsonb_array_length(p_distribucion);

    for v_indice in 0..(v_numero_pisos - 1) loop
        v_piso := p_distribucion -> v_indice;

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

            -- En el formato antiguo solo existía el baño.
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

        select coalesce(
                   jsonb_agg(x.value order by (x.value ->> 'fila')::int,
                                              (x.value ->> 'columna')::int),
                   '[]'::jsonb
               )
          into v_celdas
        from jsonb_array_elements(v_celdas) as x;

        v_total := v_total + v_cantidad - jsonb_array_length(v_celdas);

        v_objeto := jsonb_build_object(
            'numero', v_indice + 1,
            'cantidad', v_cantidad,
            'filas', v_filas,
            'columnas', v_columnas,
            'ultima_fila_5', v_central
        );

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
-- 3. Asientos de una distribución (los dos formatos).
--    Formato 2: la lista "asientos" de cada piso.
--    Formato antiguo: igual que antes (numerados en orden, sin el baño).
-- ---------------------------------------------------------------------
create or replace function public.asientos_de_distribucion(p_distribucion jsonb)
returns table (numero integer, piso integer, fila integer, columna integer, tipo text)
language sql
immutable
set search_path to ''
as $function$
    with formato2 as (
        select
            (a.value ->> 'numero')::int as numero,
            d.orden::int as piso,
            (a.value ->> 'fila')::int as fila,
            (a.value ->> 'columna')::int as columna,
            a.value ->> 'tipo' as tipo
        from jsonb_array_elements(p_distribucion) with ordinality as d(datos, orden)
        cross join lateral jsonb_array_elements(
            coalesce(d.datos -> 'asientos', '[]'::jsonb)
        ) as a
        where (d.datos ->> 'formato') = '2'
    ),
    pisos as (
        select
            (d.orden - 1)::int as indice,
            d.datos,
            (d.datos ->> 'cantidad')::int as cantidad,
            (d.datos ->> 'filas')::int as filas,
            (d.datos ->> 'columnas')::int as columnas,
            coalesce((d.datos ->> 'ultima_fila_5')::boolean, false) as central,
            jsonb_array_length(p_distribucion) as numero_pisos
        from jsonb_array_elements(p_distribucion) with ordinality as d(datos, orden)
        where (d.datos ->> 'formato') is distinct from '2'
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
    ),
    antiguo as (
        select
            (row_number() over (order by a.indice, a.pos))::int as numero,
            a.indice + 1 as piso,
            a.fila,
            a.columna,
            case when a.numero_pisos = 2 and a.indice = 0 then 'vip' else 'normal' end as tipo
        from sin_bano as a
    )
    select t.numero, t.piso, t.fila, t.columna, t.tipo
    from (
        select * from formato2
        union all
        select * from antiguo
    ) as t
    order by t.piso, t.fila, t.columna;
$function$;

-- ---------------------------------------------------------------------
-- 4. Convertir una distribución antigua (ya validada) al formato 2 sin
--    cambiar ningún número de asiento. Con 4 columnas, el pasillo central
--    implícito pasa a ser la columna 3 (pasillo); la última fila de 5
--    asientos ocupa ese hueco. Los huecos de una fila incompleta también
--    quedan como pasillo.
-- ---------------------------------------------------------------------
create or replace function public.convertir_distribucion_antigua(p_distribucion jsonb)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $function$
declare
    v_resultado jsonb := '[]'::jsonb;
    v_indice int;
    v_piso jsonb;
    v_filas int;
    v_columnas int;
    v_central boolean;
    v_con_pasillo boolean;
    v_asientos jsonb;
    v_especiales jsonb;
begin
    for v_indice in 0..(jsonb_array_length(p_distribucion) - 1) loop
        v_piso := p_distribucion -> v_indice;
        v_filas := (v_piso ->> 'filas')::int;
        v_central := coalesce((v_piso ->> 'ultima_fila_5')::boolean, false);
        v_con_pasillo := (v_piso ->> 'columnas')::int = 4;
        v_columnas := case when v_con_pasillo then 5 else (v_piso ->> 'columnas')::int end;

        -- Asientos con su número de siempre, en su nueva columna.
        select coalesce(jsonb_agg(
                   jsonb_build_object(
                       'fila', a.fila,
                       'columna', a.nueva_columna,
                       'numero', a.numero,
                       'tipo', a.tipo
                   ) order by a.fila, a.nueva_columna
               ), '[]'::jsonb)
          into v_asientos
        from (
            select x.*,
                   case
                       when v_con_pasillo
                            and not (v_central and x.fila = v_filas)
                            and x.columna >= 3
                           then x.columna + 1
                       else x.columna
                   end as nueva_columna
            from public.asientos_de_distribucion(p_distribucion) as x
            where x.piso = v_indice + 1
        ) as a;

        -- Baño en su nueva columna, y pasillo en todas las celdas libres.
        with banos as (
            select (e.value ->> 'fila')::int as fila,
                   case
                       when v_con_pasillo
                            and not (v_central and (e.value ->> 'fila')::int = v_filas)
                            and (e.value ->> 'columna')::int >= 3
                           then (e.value ->> 'columna')::int + 1
                       else (e.value ->> 'columna')::int
                   end as columna,
                   'bano'::text as tipo
            from jsonb_array_elements(
                coalesce(v_piso -> 'celdas_especiales', '[]'::jsonb)
            ) as e
        ),
        ocupadas as (
            select (a.value ->> 'fila')::int as fila, (a.value ->> 'columna')::int as columna
            from jsonb_array_elements(v_asientos) as a
            union all
            select b.fila, b.columna from banos as b
        ),
        pasillos as (
            select f.f as fila, c.c as columna, 'pasillo'::text as tipo
            from pg_catalog.generate_series(1, v_filas) as f(f)
            cross join pg_catalog.generate_series(1, v_columnas) as c(c)
            where not exists (
                select 1 from ocupadas as o where o.fila = f.f and o.columna = c.c
            )
        )
        select coalesce(jsonb_agg(
                   jsonb_build_object('fila', t.fila, 'columna', t.columna, 'tipo', t.tipo)
                   order by t.fila, t.columna
               ), '[]'::jsonb)
          into v_especiales
        from (
            select * from banos
            union all
            select * from pasillos
        ) as t;

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

    return v_resultado;
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. Validar una distribución. Acepta el formato 2 (editor visual) o el
--    antiguo (que se convierte). Devuelve siempre el formato 2 ordenado.
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

            if v_tipo not in ('bano', 'puerta', 'escalera', 'cabina', 'pasillo') then
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

            if v_tipo not in ('normal', 'vip', 'cama') then
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

        v_total := v_total + jsonb_array_length(v_asientos);

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

    if v_total > 60
       or (v_numero_pisos = 2 and v_total < 40) then
        raise exception
            'Capacidad inválida: máximo 60 asientos; en dos pisos, entre 40 y 60 (solo cuentan los asientos).'
            using errcode = '22023';
    end if;

    return v_resultado;
end;
$function$;

-- ---------------------------------------------------------------------
-- 6. Boletos vendidos que quedarían fuera de un asiento o en otro lugar
--    (la de la nube, con los nuevos tipos de celda en el mensaje).
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
-- 7. Plantillas con nombre
-- ---------------------------------------------------------------------
alter table public.plantillas_bus
    add column if not exists nombre varchar(60);

-- Plantilla por tipo: el nombre del tipo. Plantilla propia: "Bus <placa>".
update public.plantillas_bus as pb
set nombre = left(btrim(pb.tipo_bus), 60)
where pb.nombre is null
  and pb.bus_id is null;

update public.plantillas_bus as pb
set nombre = 'Bus ' || b.placa
from public.buses as b
where pb.nombre is null
  and b.id = pb.bus_id;

update public.plantillas_bus as pb
set nombre = left('Plantilla ' || btrim(pb.tipo_bus), 60)
where pb.nombre is null;

-- Nombres repetidos dentro de la cooperativa: "Nombre (2)", "Nombre (3)"...
with repetidos as (
    select pb.id,
           pb.nombre,
           row_number() over (
               partition by pb.cooperativa_id, lower(pb.nombre)
               order by pb.bus_id nulls first, pb.creado_en, pb.id
           ) as orden
    from public.plantillas_bus as pb
)
update public.plantillas_bus as pb
set nombre = left(r.nombre, 54) || ' (' || r.orden || ')'
from repetidos as r
where r.id = pb.id
  and r.orden > 1;

alter table public.plantillas_bus alter column nombre set not null;

alter table public.plantillas_bus drop constraint if exists plantillas_bus_nombre_check;
alter table public.plantillas_bus
    add constraint plantillas_bus_nombre_check
        check (nombre = btrim(nombre) and length(nombre) between 1 and 60);

-- El tipo ya no identifica a la plantilla: se quitan los índices únicos
-- por tipo (en la nube su definición puede variar).
do $$
declare
    v_indice text;
begin
    for v_indice in
        select i.indexname
        from pg_catalog.pg_indexes as i
        where i.schemaname = 'public'
          and i.tablename = 'plantillas_bus'
          and i.indexdef ilike '%unique%'
          and i.indexdef ilike '%tipo_bus%'
    loop
        execute format('drop index public.%I', v_indice);
    end loop;
end;
$$;

create unique index if not exists plantillas_bus_nombre_unico
    on public.plantillas_bus (cooperativa_id, lower(nombre));

-- Las plantillas propias dejan de estar atadas a un bus (siguen asignadas
-- a ese bus por buses.plantilla_id).
update public.plantillas_bus set bus_id = null where bus_id is not null;

-- ---------------------------------------------------------------------
-- 8. Pasar todas las plantillas al formato 2 sin cambiar ningún número.
-- ---------------------------------------------------------------------
do $$
declare
    v_plantilla record;
    v_nueva jsonb;
begin
    for v_plantilla in
        select pb.id, pb.nombre, pb.distribucion
        from public.plantillas_bus as pb
        where exists (
            select 1 from jsonb_array_elements(pb.distribucion) as d
            where (d.value ->> 'formato') is distinct from '2'
        )
    loop
        v_nueva := public.validar_distribucion_plantilla(v_plantilla.distribucion);

        -- Los asientos (número, piso, fila y tipo) deben ser los mismos.
        if exists (
            (select a.numero, a.piso, a.fila, a.tipo
             from public.asientos_de_distribucion(v_plantilla.distribucion) as a
             except
             select n.numero, n.piso, n.fila, n.tipo
             from public.asientos_de_distribucion(v_nueva) as n)
            union all
            (select n.numero, n.piso, n.fila, n.tipo
             from public.asientos_de_distribucion(v_nueva) as n
             except
             select a.numero, a.piso, a.fila, a.tipo
             from public.asientos_de_distribucion(v_plantilla.distribucion) as a)
        ) then
            raise exception 'La plantilla «%» cambiaría sus asientos al convertirla. No se aplicó ningún cambio.',
                v_plantilla.nombre;
        end if;

        update public.plantillas_bus as pb
        set distribucion = v_nueva,
            actualizado_en = clock_timestamp()
        where pb.id = v_plantilla.id;

        perform public.generar_asientos_plantilla(v_plantilla.id, v_nueva);
    end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Quién puede gestionar las plantillas de una cooperativa
-- ---------------------------------------------------------------------
create or replace function public.exigir_gestor_de_plantillas(p_cooperativa_id uuid)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    v_rol text := public.rol_actual();
begin
    if auth.uid() is null
       or v_rol is null
       or v_rol not in ('administrador', 'cooperativa')
       or (v_rol = 'cooperativa' and not public.es_de_mi_cooperativa(p_cooperativa_id)) then
        raise exception 'No tienes permiso para gestionar las plantillas de esta cooperativa.'
            using errcode = '42501';
    end if;

    if p_cooperativa_id is null
       or not exists (select 1 from public.cooperativas as c where c.id = p_cooperativa_id) then
        raise exception 'La cooperativa no existe.'
            using errcode = '22023';
    end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- 10. Guardar (crear o editar) una plantilla con nombre
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

    select count(*) into v_total
    from public.asientos_de_distribucion(v_distribucion);

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
-- 11. Eliminar una plantilla que ningún bus usa
-- ---------------------------------------------------------------------
create or replace function public.eliminar_plantilla(
    p_cooperativa_id uuid,
    p_plantilla_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_plantilla public.plantillas_bus%rowtype;
    v_cantidad int;
    v_placas text;
begin
    perform public.exigir_gestor_de_plantillas(p_cooperativa_id);

    select pb.* into v_plantilla
    from public.plantillas_bus as pb
    where pb.id = p_plantilla_id
      and pb.cooperativa_id = p_cooperativa_id
    for update;

    if not found then
        raise exception 'La plantilla ya no existe. Vuelve a cargar la página.'
            using errcode = '40001';
    end if;

    select count(*), string_agg(b.placa, ', ' order by b.placa)
      into v_cantidad, v_placas
    from public.buses as b
    where b.plantilla_id = p_plantilla_id;

    if v_cantidad > 0 then
        raise exception 'No se puede eliminar «%» porque la usa% % (%).',
            v_plantilla.nombre,
            case when v_cantidad = 1 then '' else 'n' end,
            case when v_cantidad = 1 then '1 bus' else v_cantidad || ' buses' end,
            v_placas
            using errcode = '23503',
                  hint = 'Asigna otra plantilla a esos buses antes de eliminarla.';
    end if;

    delete from public.plantillas_bus as pb where pb.id = p_plantilla_id;
end;
$function$;

revoke all on function public.exigir_gestor_de_plantillas(uuid) from public, anon;
revoke all on function public.guardar_plantilla(uuid, uuid, text, jsonb, timestamptz) from public, anon;
revoke all on function public.eliminar_plantilla(uuid, uuid) from public, anon;
grant execute on function public.exigir_gestor_de_plantillas(uuid) to authenticated;
grant execute on function public.guardar_plantilla(uuid, uuid, text, jsonb, timestamptz) to authenticated;
grant execute on function public.eliminar_plantilla(uuid, uuid) to authenticated;

-- Las funciones por tipo y por bus (cambio 11) ya no se usan: dejan de
-- poder llamarse desde la aplicación (no se borran).
do $$
declare
    v_funcion text;
begin
    foreach v_funcion in array array[
        'public.guardar_plantilla_bus(uuid, text, jsonb, timestamptz)',
        'public.guardar_plantilla_individual(uuid, uuid, jsonb, timestamptz)',
        'public.quitar_plantilla_individual(uuid, uuid)'
    ]
    loop
        if to_regprocedure(v_funcion) is not null then
            execute format('revoke execute on function %s from public, anon, authenticated', v_funcion);
        end if;
    end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 12. Plantilla de cada bus
--     - Bus nuevo sin plantilla: la de igual nombre que su grupo.
--     - Cambiar de grupo no cambia la plantilla.
--     - Cambiar la plantilla: debe ser de la misma cooperativa y ningún
--       boleto vendido de un viaje pendiente puede quedar fuera de un
--       asiento o en otro lugar (fecha de Ecuador).
-- ---------------------------------------------------------------------
create or replace function public.asignar_plantilla_a_bus()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_nueva public.plantillas_bus%rowtype;
begin
    if tg_op = 'INSERT' and new.plantilla_id is null then
        select pb.id into new.plantilla_id
        from public.plantillas_bus as pb
        where pb.cooperativa_id = new.cooperativa_id
          and lower(pb.nombre) = lower(btrim(new.tipo_bus));
    end if;

    if new.plantilla_id is not null then
        select pb.* into v_nueva
        from public.plantillas_bus as pb
        where pb.id = new.plantilla_id;

        if not found or v_nueva.cooperativa_id <> new.cooperativa_id then
            raise exception 'La plantilla elegida no pertenece a la cooperativa del bus.'
                using errcode = '23503';
        end if;
    end if;

    if tg_op = 'UPDATE' and new.plantilla_id is distinct from old.plantilla_id then
        perform public.exigir_boletos_sin_cambios(
            old.plantilla_id,
            old.id,
            coalesce(v_nueva.distribucion, '[]'::jsonb)
        );
    end if;

    return new;
end;
$function$;

drop trigger if exists buses_asignar_plantilla on public.buses;
create trigger buses_asignar_plantilla
    before insert or update of plantilla_id, cooperativa_id
    on public.buses
    for each row
    execute function public.asignar_plantilla_a_bus();

-- Renombrar un grupo ya no toca las plantillas (solo el tipo de sus buses).
create or replace function public.renombrar_grupo_bus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.nombre <> old.nombre then
        update public.buses as b
        set tipo_bus = new.nombre
        where b.grupo_id = new.id;
    end if;

    return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 13. Hoja de ruta: el bus debe tener plantilla (buses.plantilla_id).
--     Es la función de la nube (consultada el 15/11/2026) sin otro cambio
--     que esa regla: antes buscaba una plantilla con el nombre del tipo.
--     El trigger hojas_ruta_validar ya la usa.
-- ---------------------------------------------------------------------
create or replace function public.validar_hoja_ruta()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_activa boolean;
  v_coop_frecuencia uuid;
  v_coop_bus uuid;
  v_tipo_bus text;
  v_hoy date;
begin
  v_hoy := (now() at time zone 'America/Guayaquil')::date;

  select f.activa, f.cooperativa_id
    into v_activa, v_coop_frecuencia
  from public.frecuencias as f
  where f.id = new.frecuencia_id;

  select b.cooperativa_id, b.tipo_bus
    into v_coop_bus, v_tipo_bus
  from public.buses as b
  where b.id = new.bus_id;

  if tg_op = 'INSERT' then
    if new.fecha < v_hoy then
      raise exception 'No se pueden crear hojas de ruta con fechas pasadas.'
        using errcode = '23514';
    end if;

    if new.fecha > v_hoy + 14 then
      raise exception 'No se pueden crear hojas de ruta con más de 14 días de anticipación.'
        using errcode = '23514';
    end if;

    if v_activa is not true then
      raise exception 'La frecuencia está desactivada.'
        using errcode = '23514';
    end if;
  else
    -- Una hoja de un día pasado ya no se reasigna.
    if old.fecha < v_hoy
       and (
         new.bus_id is distinct from old.bus_id
         or new.frecuencia_id is distinct from old.frecuencia_id
         or new.fecha is distinct from old.fecha
       ) then
      raise exception 'No se puede cambiar una hoja de ruta de un día pasado.'
        using errcode = '23514';
    end if;
  end if;

  if v_coop_frecuencia is not null
     and v_coop_frecuencia is distinct from v_coop_bus then
    raise exception 'El bus pertenece a otra cooperativa distinta a la de la frecuencia.'
      using errcode = '23514';
  end if;

  -- Solo buses que ya tienen plantilla de asientos (cambio 6: cada bus
  -- tiene la suya en buses.plantilla_id).
  if tg_op = 'INSERT' or new.bus_id is distinct from old.bus_id then
    if not exists (
      select 1
      from public.buses as bp
      where bp.id = new.bus_id
        and bp.plantilla_id is not null
    ) then
      raise exception 'El bus no tiene plantilla de asientos. Configúrala antes de asignarlo.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

notify pgrst, 'reload schema';

commit;

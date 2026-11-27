-- =====================================================================
-- Cambio 4, parte 4.4: tareas automáticas con pg_cron
--
--   1. Cada 5 minutos: expirar_compras_vencidas() (compras sin comprobante
--      después de 3 horas; sus boletos reservados se anulan y los asientos
--      quedan libres).
--   2. Cada noche a las 02:00 de Ecuador (07:00 UTC, la base está en UTC):
--      se genera la hoja de ruta de cada grupo con frecuencias activas para
--      tener siempre hasta hoy + 6 días. Se generan solo los días que siguen
--      al último ya generado (nunca se rehace un día existente), respetando
--      la flota mínima (frecuencias + descanso + retén) y los días con boletos.
--   3. Si un grupo no se puede generar (por ejemplo, le faltan buses), el
--      motivo queda en grupos_bus.aviso_hoja_ruta / aviso_hoja_ruta_en y se
--      muestra al gerente y en Hoja de ruta. Se borra cuando la generación
--      (automática o manual) sale bien.
--
-- generar_hoja_ruta se divide en:
--   _generar_hoja_ruta  interna, sin sesión (la usa la tarea nocturna);
--   generar_hoja_ruta   pública, con los mismos permisos de antes.
--
-- Se puede ejecutar dos veces: las tareas se reemplazan por nombre.
-- Requiere pg_cron activado (Database -> Extensions).
-- Todo en una sola transacción.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Comprobaciones previas
-- ---------------------------------------------------------------------
do $$
declare
    v_src text;
begin
    if not exists (select 1 from pg_extension where extname = 'pg_cron') then
        raise exception 'pg_cron no está activado. Actívalo en Database -> Extensions y vuelve a ejecutar.';
    end if;

    if to_regprocedure('public.expirar_compras_vencidas()') is null then
        raise exception 'Falta public.expirar_compras_vencidas().';
    end if;

    select p.prosrc into v_src
    from pg_proc as p
    where p.oid = to_regprocedure('public.expirar_compras_vencidas()');

    if v_src not like '%pendiente_comprobante%' or v_src not like '%vence_en < now()%' then
        raise exception 'public.expirar_compras_vencidas() no es la esperada. Envía su definición.';
    end if;

    if to_regprocedure('public.generar_hoja_ruta(uuid, date, date)') is null then
        raise exception 'Falta public.generar_hoja_ruta(uuid, date, date).';
    end if;

    select p.prosrc into v_src
    from pg_proc as p
    where p.oid = to_regprocedure('public.generar_hoja_ruta(uuid, date, date)');

    -- La versión de cambio4-base-nube.txt, o la ya dividida (segunda ejecución).
    if v_src not like '%_generar_hoja_ruta(%'
       and (v_src not like '%perform public.exigir_gestor_de_hoja_ruta(p_grupo_id);%'
            or v_src not like '%v_b < v_f + 2%'
            or v_src not like '%public.boletos_dia_hoja_ruta(p_grupo_id, v_dia)%') then
        raise exception 'public.generar_hoja_ruta no es la esperada. Envía su definición.';
    end if;

    if to_regprocedure('public.exigir_gestor_de_hoja_ruta(uuid)') is null
       or to_regprocedure('public.boletos_dia_hoja_ruta(uuid, date)') is null
       or to_regprocedure('public.orden_dia_hoja_ruta(uuid, date)') is null then
        raise exception 'Faltan funciones de la hoja de ruta (exigir_gestor_de_hoja_ruta, boletos_dia_hoja_ruta u orden_dia_hoja_ruta).';
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Aviso de la hoja de ruta en el grupo
-- ---------------------------------------------------------------------
alter table public.grupos_bus
    add column if not exists aviso_hoja_ruta text,
    add column if not exists aviso_hoja_ruta_en timestamptz;

alter table public.grupos_bus drop constraint if exists grupos_bus_aviso_hoja_ruta_check;
alter table public.grupos_bus
    add constraint grupos_bus_aviso_hoja_ruta_check check (
        (aviso_hoja_ruta is null and aviso_hoja_ruta_en is null)
        or (aviso_hoja_ruta is not null
            and length(btrim(aviso_hoja_ruta)) between 1 and 500
            and aviso_hoja_ruta_en is not null)
    );

comment on column public.grupos_bus.aviso_hoja_ruta is
    'Motivo por el que la generación automática de la hoja de ruta no se pudo hacer (por ejemplo, faltan buses). Se borra cuando la generación sale bien.';
comment on column public.grupos_bus.aviso_hoja_ruta_en is
    'Cuándo se guardó el aviso de la hoja de ruta.';

-- ---------------------------------------------------------------------
-- 2. Generación interna (sin sesión). Es la misma lógica de
--    generar_hoja_ruta (cambio4-base-nube.txt) sin la comprobación de
--    permisos; al terminar bien, borra el aviso del grupo.
-- ---------------------------------------------------------------------
create or replace function public._generar_hoja_ruta(p_grupo_id uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_hoy date := (now() at time zone 'America/Guayaquil')::date;
    v_frecuencias bigint[];
    v_todas_frecuencias bigint[];
    v_buses uuid[];
    v_todos_buses uuid[];
    v_f int;
    v_b int;
    v_orden uuid[];
    v_ultimo date;
    v_seq uuid[];
    v_k int;
    v_dia date;
    v_boletos int;
    v_existente uuid[];
    v_i int;
    v_generados jsonb := '[]'::jsonb;
    v_conservados jsonb := '[]'::jsonb;
begin
    -- Un grupo se genera de a uno (evita dos generaciones a la vez).
    perform 1 from public.grupos_bus as g where g.id = p_grupo_id for update;

    if not found then
        raise exception 'El grupo de bus no existe. Recarga la página.' using errcode = '40001';
    end if;

    if p_desde is null or p_hasta is null or p_hasta < p_desde then
        raise exception 'Elige un rango de fechas válido.' using errcode = '22023';
    end if;

    if p_desde < v_hoy then
        raise exception 'No se pueden generar días pasados (hoy es %).', to_char(v_hoy, 'DD/MM/YYYY') using errcode = '23514';
    end if;

    if p_hasta > v_hoy + 14 then
        raise exception 'Solo se puede generar hasta 14 días de anticipación (hasta el %).', to_char(v_hoy + 14, 'DD/MM/YYYY')
            using errcode = '23514';
    end if;

    -- Frecuencias activas del grupo, en el orden de la hoja de ruta.
    select coalesce(array_agg(f.id order by f.orden_hoja_ruta nulls last, f.hora, f.id), '{}')
      into v_frecuencias
    from public.frecuencias as f
    where f.grupo_id = p_grupo_id and f.activa;

    select coalesce(array_agg(f.id), '{}') into v_todas_frecuencias
    from public.frecuencias as f where f.grupo_id = p_grupo_id;

    -- Buses del grupo con plantilla, por número interno (numérico si lo es).
    select coalesce(array_agg(b.id order by substring(b.numero_interno from '^[0-9]+')::int nulls last, b.numero_interno), '{}')
      into v_buses
    from public.buses as b
    where b.grupo_id = p_grupo_id and b.plantilla_id is not null;

    select coalesce(array_agg(b.id), '{}') into v_todos_buses
    from public.buses as b where b.grupo_id = p_grupo_id;

    v_f := cardinality(v_frecuencias);
    v_b := cardinality(v_buses);

    if v_f = 0 then
        raise exception 'El grupo no tiene frecuencias activas.' using errcode = '23514';
    end if;

    if v_b < v_f + 2 then
        raise exception 'Faltan % %: el grupo tiene % % con plantilla y % % activa%; se necesitan al menos % (frecuencias + descanso + retén).',
            v_f + 2 - v_b, case when v_f + 2 - v_b = 1 then 'bus' else 'buses' end,
            v_b, case when v_b = 1 then 'bus' else 'buses' end,
            v_f, case when v_f = 1 then 'frecuencia' else 'frecuencias' end, case when v_f = 1 then '' else 's' end,
            v_f + 2
            using errcode = '23514';
    end if;

    -- Último día ya generado antes del rango: la rotación continúa desde él.
    select max(x.fecha) into v_ultimo
    from (
        select h.fecha from public.hojas_ruta as h
        where h.frecuencia_id = any (v_todas_frecuencias) and h.fecha < p_desde
        union all
        select p.fecha from public.hojas_ruta_paradas as p
        where p.grupo_id = p_grupo_id and p.fecha < p_desde
    ) as x;

    if v_ultimo is not null then
        v_orden := public.orden_dia_hoja_ruta(p_grupo_id, v_ultimo);
    end if;

    for v_dia in select d::date from generate_series(p_desde, p_hasta, interval '1 day') as d loop
        v_boletos := public.boletos_dia_hoja_ruta(p_grupo_id, v_dia);

        -- Día con boletos: se conserva y la rotación sigue desde él.
        if v_boletos > 0 then
            v_conservados := v_conservados || jsonb_build_object('fecha', v_dia, 'boletos', v_boletos);
            v_existente := public.orden_dia_hoja_ruta(p_grupo_id, v_dia);

            if cardinality(v_existente) > 0 then
                v_orden := v_existente;
                v_ultimo := v_dia;
            end if;

            continue;
        end if;

        -- Orden del día: inicial, o el anterior (sin los que salieron, con los
        -- nuevos al final) rotado un día por cada día de diferencia.
        if v_orden is null or cardinality(v_orden) = 0 then
            v_seq := v_buses;
        else
            v_seq := array(
                select u.id from unnest(v_orden) with ordinality as u(id, n)
                where u.id = any (v_buses) order by u.n
            ) || array(
                select u.id from unnest(v_buses) with ordinality as u(id, n)
                where not (u.id = any (v_orden)) order by u.n
            );

            v_k := (v_dia - v_ultimo) % v_b;

            if v_k > 0 then
                v_seq := v_seq[v_b - v_k + 1 : v_b] || v_seq[1 : v_b - v_k];
            end if;
        end if;

        -- Se rehace el día (sin boletos): hojas del grupo (con sus viajes) y paradas.
        delete from public.hojas_ruta as h
        where h.fecha = v_dia
          and (h.frecuencia_id = any (v_todas_frecuencias) or h.bus_id = any (v_todos_buses));

        delete from public.hojas_ruta_paradas as p
        where p.fecha = v_dia
          and (p.grupo_id = p_grupo_id or p.bus_id = any (v_todos_buses));

        for v_i in 1..v_f loop
            insert into public.hojas_ruta (frecuencia_id, bus_id, fecha)
            values (v_frecuencias[v_i], v_seq[v_i], v_dia);
        end loop;

        for v_i in (v_f + 1)..(v_b - 1) loop
            insert into public.hojas_ruta_paradas (grupo_id, fecha, bus_id, tipo, posicion)
            values (p_grupo_id, v_dia, v_seq[v_i], 'descanso', v_i - v_f);
        end loop;

        insert into public.hojas_ruta_paradas (grupo_id, fecha, bus_id, tipo, posicion)
        values (p_grupo_id, v_dia, v_seq[v_b], 'reten', 1);

        v_generados := v_generados || to_jsonb(v_dia);
        v_orden := v_seq;
        v_ultimo := v_dia;
    end loop;

    -- Cambio 4.4: la generación salió bien, el aviso ya no aplica.
    update public.grupos_bus as g
    set aviso_hoja_ruta = null,
        aviso_hoja_ruta_en = null
    where g.id = p_grupo_id
      and g.aviso_hoja_ruta is not null;

    return jsonb_build_object('generados', v_generados, 'conservados', v_conservados);
exception
    when unique_violation then
        raise exception 'Un bus del grupo ya tiene otro turno en esos días (por ejemplo en otra frecuencia). Revisa la hoja de ruta. Detalle: %', sqlerrm
            using errcode = '23505';
end;
$function$;

revoke all on function public._generar_hoja_ruta(uuid, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Generación pública: los mismos permisos de antes (gerente u
--    oficinista de la cooperativa del grupo, o administrador).
--    create or replace conserva sus permisos de ejecución.
-- ---------------------------------------------------------------------
create or replace function public.generar_hoja_ruta(p_grupo_id uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
    perform public.exigir_gestor_de_hoja_ruta(p_grupo_id);
    return public._generar_hoja_ruta(p_grupo_id, p_desde, p_hasta);
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. Tarea nocturna: cada grupo con frecuencias activas queda generado
--    hasta hoy + p_dias. Solo se generan los días que siguen al último
--    ya generado (o desde hoy si no hay ninguno). Un grupo con problemas
--    no detiene a los demás: su motivo queda como aviso.
--    Devuelve el detalle por grupo (sirve para probarla a mano).
-- ---------------------------------------------------------------------
create or replace function public.generar_hojas_ruta_automaticas(p_dias int default 6)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_hoy date := (now() at time zone 'America/Guayaquil')::date;
    v_hasta date;
    v_grupo record;
    v_ultimo date;
    v_desde date;
    v_resultado jsonb;
    v_aviso text;
    v_detalle jsonb := '[]'::jsonb;
begin
    if p_dias is null or p_dias < 0 or p_dias > 14 then
        raise exception 'p_dias debe estar entre 0 y 14.' using errcode = '22023';
    end if;

    v_hasta := v_hoy + p_dias;

    -- Grupos sin frecuencias activas: no hay nada que generar ni que avisar.
    update public.grupos_bus as g
    set aviso_hoja_ruta = null,
        aviso_hoja_ruta_en = null
    where g.aviso_hoja_ruta is not null
      and not exists (
          select 1 from public.frecuencias as f
          where f.grupo_id = g.id and f.activa
      );

    for v_grupo in
        select g.id, g.nombre, g.cooperativa_id
        from public.grupos_bus as g
        where exists (
            select 1 from public.frecuencias as f
            where f.grupo_id = g.id and f.activa
        )
        order by g.cooperativa_id, g.nombre
    loop
        -- Último día generado del grupo (sus frecuencias o sus paradas).
        select max(x.fecha) into v_ultimo
        from (
            select h.fecha
            from public.hojas_ruta as h
            join public.frecuencias as f on f.id = h.frecuencia_id
            where f.grupo_id = v_grupo.id
            union all
            select p.fecha
            from public.hojas_ruta_paradas as p
            where p.grupo_id = v_grupo.id
        ) as x;

        v_desde := greatest(v_hoy, coalesce(v_ultimo + 1, v_hoy));

        if v_desde > v_hasta then
            v_detalle := v_detalle || jsonb_build_object(
                'grupo', v_grupo.nombre, 'grupo_id', v_grupo.id,
                'resultado', 'al_dia', 'hasta', v_ultimo);
            continue;
        end if;

        begin
            v_resultado := public._generar_hoja_ruta(v_grupo.id, v_desde, v_hasta);

            v_detalle := v_detalle || jsonb_build_object(
                'grupo', v_grupo.nombre, 'grupo_id', v_grupo.id,
                'resultado', 'generado', 'desde', v_desde, 'hasta', v_hasta)
                || v_resultado;
        exception
            when others then
                v_aviso := left('La hoja de ruta automática no se pudo generar del '
                    || to_char(v_desde, 'DD/MM/YYYY') || ' al ' || to_char(v_hasta, 'DD/MM/YYYY')
                    || ': ' || sqlerrm, 500);

                update public.grupos_bus as g
                set aviso_hoja_ruta = v_aviso,
                    aviso_hoja_ruta_en = now()
                where g.id = v_grupo.id;

                v_detalle := v_detalle || jsonb_build_object(
                    'grupo', v_grupo.nombre, 'grupo_id', v_grupo.id,
                    'resultado', 'aviso', 'aviso', v_aviso);
        end;
    end loop;

    return jsonb_build_object('fecha', v_hoy, 'hasta', v_hasta, 'grupos', v_detalle);
end;
$function$;

revoke all on function public.generar_hojas_ruta_automaticas(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Tareas programadas (pg_cron). Se quitan las anteriores con el mismo
--    nombre para que no se dupliquen si la migración se ejecuta dos veces.
-- ---------------------------------------------------------------------
select cron.unschedule(j.jobid)
from cron.job as j
where j.jobname in ('movipass-expirar-compras', 'movipass-hoja-ruta-nocturna');

select cron.schedule(
    'movipass-expirar-compras',
    '*/5 * * * *',
    $cron$select public.expirar_compras_vencidas();$cron$
);

-- 02:00 en Ecuador = 07:00 UTC (Ecuador no cambia de hora).
select cron.schedule(
    'movipass-hoja-ruta-nocturna',
    '0 7 * * *',
    $cron$select public.generar_hojas_ruta_automaticas(6);$cron$
);

notify pgrst, 'reload schema';

commit;

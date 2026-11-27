-- =====================================================================
-- Cambio 4, corrección de la parte 4.4: detalle por grupo de
-- generar_hojas_ruta_automaticas
--
-- Parte de la base en la nube con 20261127090000_tareas_automaticas.sql
-- aplicada. En el resultado, el objeto {"generados", "conservados"} de un
-- grupo generado salía como elemento suelto de la lista "grupos" en lugar
-- de ir dentro del objeto de ese grupo:
--     v_detalle || jsonb_build_object(...) || v_resultado
-- se evalúa como (v_detalle || objeto) || v_resultado.
--
-- Ahora cada grupo generado queda así:
--     {"grupo", "grupo_id", "resultado": "generado", "desde", "hasta",
--      "generados": [...], "conservados": [...]}
--
-- Solo cambia esa asignación: la misma firma, la misma lógica, los mismos
-- permisos. La tarea programada (movipass-hoja-ruta-nocturna) no cambia
-- porque llama a la función por su nombre.
-- Se puede ejecutar dos veces. Todo en una sola transacción.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Comprobaciones previas: la función es la de 20261127090000 (o ya
--    está corregida, si esta migración se ejecuta otra vez).
-- ---------------------------------------------------------------------
do $$
declare
    v_src text;
begin
    if to_regprocedure('public.generar_hojas_ruta_automaticas(integer)') is null then
        raise exception 'Falta public.generar_hojas_ruta_automaticas(int). Aplica antes 20261127090000_tareas_automaticas.sql.';
    end if;

    if to_regprocedure('public._generar_hoja_ruta(uuid, date, date)') is null then
        raise exception 'Falta public._generar_hoja_ruta(uuid, date, date). Aplica antes 20261127090000_tareas_automaticas.sql.';
    end if;

    select p.prosrc into v_src
    from pg_proc as p
    where p.oid = to_regprocedure('public.generar_hojas_ruta_automaticas(integer)');

    if v_src not like '%jsonb_build_array(%'
       and v_src !~ '''hasta'', v_hasta\)\s*\|\|\s*v_resultado;' then
        raise exception 'public.generar_hojas_ruta_automaticas no es la esperada. Envía su definición.';
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Tarea nocturna con el detalle completo dentro de cada grupo
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

            -- Corrección: el detalle (generados y conservados) va dentro del
            -- objeto del grupo. jsonb_build_array evita que || lo agregue a la
            -- lista como un elemento suelto (|| se evalúa de izquierda a derecha).
            v_detalle := v_detalle || jsonb_build_array(
                jsonb_build_object(
                    'grupo', v_grupo.nombre, 'grupo_id', v_grupo.id,
                    'resultado', 'generado', 'desde', v_desde, 'hasta', v_hasta)
                || v_resultado
            );
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

notify pgrst, 'reload schema';

commit;

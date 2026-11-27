// Ejecutar: node --test tests/tareasAutomaticas.test.cjs
// Cambio 4, parte 4.4: tareas automáticas con pg_cron (compras vencidas cada
// 5 minutos y hoja de ruta nocturna) y aviso de la hoja de ruta por grupo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const operacion = () => import('../frontend/js/reglasOperacion.js');
const leer = (ruta) => readFileSync(join(__dirname, '..', ruta), 'utf8');
const MIGRACION = 'supabase/migrations/20261127090000_tareas_automaticas.sql';

/** Cuerpo de una función de la migración (desde su create hasta su $function$ final). */
function cuerpo(sql, nombre) {
    const inicio = sql.indexOf(`create or replace function public.${nombre}(`);
    assert.ok(inicio >= 0, `falta ${nombre}`);
    const fin = sql.indexOf('$function$;', inicio);
    return sql.slice(inicio, fin);
}

/* ------------------------------ Reglas de pantalla ------------------------------ */

test('aviso de la hoja de ruta: texto, grupo y hora de Ecuador', async () => {
    const { avisoHojaRuta } = await operacion();

    assert.equal(avisoHojaRuta(null), null);
    assert.equal(avisoHojaRuta({ nombre: 'Cómodos', aviso_hoja_ruta: null }), null);
    assert.equal(avisoHojaRuta({ nombre: 'Cómodos', aviso_hoja_ruta: '   ' }), null);

    // 07:00 UTC = 02:00 en Ecuador.
    const aviso = avisoHojaRuta({
        nombre: 'Cómodos',
        aviso_hoja_ruta: 'Faltan 2 buses: ...',
        aviso_hoja_ruta_en: '2026-11-20T07:00:05Z'
    });
    assert.deepEqual(aviso, {
        titulo: 'Grupo Cómodos',
        texto: 'Faltan 2 buses: ...',
        cuando: 'Revisado el 20/11/2026 02:00.'
    });
});

test('grupos con aviso: solo los que tienen, por nombre', async () => {
    const { gruposConAviso } = await operacion();
    const grupos = [
        { nombre: 'Rancheras', aviso_hoja_ruta: 'Faltan buses', aviso_hoja_ruta_en: '2026-11-20T07:00:00Z' },
        { nombre: 'Cómodos', aviso_hoja_ruta: null },
        { nombre: 'Buses', aviso_hoja_ruta: 'Faltan buses', aviso_hoja_ruta_en: '2026-11-20T07:00:00Z' }
    ];
    assert.deepEqual(gruposConAviso(grupos).map((g) => g.nombre), ['Buses', 'Rancheras']);
    assert.deepEqual(gruposConAviso(), []);
});

test('fecha y hora de Ecuador; días de la tarea nocturna', async () => {
    const { fechaHoraEcuador, DIAS_HOJA_AUTOMATICA } = await operacion();
    assert.equal(fechaHoraEcuador('2026-11-21T04:30:00Z'), '20/11/2026 23:30');
    assert.equal(fechaHoraEcuador(''), '');
    assert.equal(fechaHoraEcuador('no es fecha'), '');
    assert.equal(DIAS_HOJA_AUTOMATICA, 6);
});

/* ------------------------------ Migración ------------------------------ */

test('migración: una sola transacción y exige pg_cron', () => {
    const sql = leer(MIGRACION);
    assert.equal((sql.match(/^begin;/gm) ?? []).length, 1);
    assert.equal((sql.match(/^commit;/gm) ?? []).length, 1);
    assert.ok(sql.trimEnd().endsWith('commit;'));
    assert.match(sql, /extname = 'pg_cron'/);
    assert.match(sql, /no es la esperada\. Envía su definición/);
});

test('migración: tareas sin duplicar, cada 5 minutos y a las 02:00 de Ecuador (07:00 UTC)', () => {
    const sql = leer(MIGRACION);

    const unschedule = sql.indexOf('cron.unschedule');
    const schedule = sql.indexOf('cron.schedule(');
    assert.ok(unschedule > 0 && unschedule < schedule, 'se quitan las tareas antes de crearlas');
    assert.match(sql, /jobname in \('movipass-expirar-compras', 'movipass-hoja-ruta-nocturna'\)/);

    assert.match(sql, /'movipass-expirar-compras',\s*'\*\/5 \* \* \* \*',\s*\$cron\$select public\.expirar_compras_vencidas\(\);\$cron\$/);
    assert.match(sql, /'movipass-hoja-ruta-nocturna',\s*'0 7 \* \* \*',\s*\$cron\$select public\.generar_hojas_ruta_automaticas\(6\);\$cron\$/);
});

test('migración: aviso en grupos_bus, los dos campos juntos', () => {
    const sql = leer(MIGRACION);
    assert.match(sql, /add column if not exists aviso_hoja_ruta text/);
    assert.match(sql, /add column if not exists aviso_hoja_ruta_en timestamptz/);
    assert.match(sql, /drop constraint if exists grupos_bus_aviso_hoja_ruta_check/);
    assert.match(sql, /aviso_hoja_ruta is null and aviso_hoja_ruta_en is null/);
});

test('migración: generar_hoja_ruta pública con permisos y la interna sin sesión', () => {
    const sql = leer(MIGRACION);

    const publica = cuerpo(sql, 'generar_hoja_ruta');
    assert.match(publica, /perform public\.exigir_gestor_de_hoja_ruta\(p_grupo_id\);/);
    assert.match(publica, /return public\._generar_hoja_ruta\(p_grupo_id, p_desde, p_hasta\);/);

    const interna = cuerpo(sql, '_generar_hoja_ruta');
    assert.doesNotMatch(interna, /exigir_gestor_de_hoja_ruta|auth\.uid|rol_actual/);
    // Flota mínima y días con boletos, como antes.
    assert.match(interna, /v_b < v_f \+ 2/);
    assert.match(interna, /boletos_dia_hoja_ruta\(p_grupo_id, v_dia\)/);
    assert.match(interna, /if v_boletos > 0 then/);
    // Al salir bien, se borra el aviso.
    assert.match(interna, /set aviso_hoja_ruta = null,\s*aviso_hoja_ruta_en = null/);

    assert.match(sql, /revoke all on function public\._generar_hoja_ruta\(uuid, date, date\) from public, anon, authenticated;/);
    assert.match(sql, /revoke all on function public\.generar_hojas_ruta_automaticas\(int\) from public, anon, authenticated;/);
});

test('migración: la tarea nocturna genera hasta hoy + 6, solo días nuevos, y guarda el aviso', () => {
    const sql = leer(MIGRACION);
    const tarea = cuerpo(sql, 'generar_hojas_ruta_automaticas');

    assert.match(tarea, /at time zone 'America\/Guayaquil'/);
    assert.match(tarea, /v_hasta := v_hoy \+ p_dias;/);
    // Solo grupos con frecuencias activas.
    assert.match(tarea, /where f\.grupo_id = g\.id and f\.activa/);
    // Desde el día siguiente al último generado (nunca rehace un día).
    assert.match(tarea, /v_desde := greatest\(v_hoy, coalesce\(v_ultimo \+ 1, v_hoy\)\);/);
    assert.match(tarea, /if v_desde > v_hasta then/);
    assert.match(tarea, /public\._generar_hoja_ruta\(v_grupo\.id, v_desde, v_hasta\)/);
    // Un grupo con problemas no detiene a los demás: su motivo queda como aviso.
    assert.match(tarea, /exception\s+when others then/);
    assert.match(tarea, /set aviso_hoja_ruta = v_aviso,\s*aviso_hoja_ruta_en = now\(\)/);
    assert.match(tarea, /left\(/);
});

/* ------------------------------ Pantallas ------------------------------ */

test('Hoja de ruta y panel del gerente muestran el aviso', () => {
    const htmlHoja = leer('frontend/pages/frecuencias/hoja-ruta.html');
    const jsHoja = leer('frontend/pages/frecuencias/hoja-ruta.js');
    assert.match(htmlHoja, /id="avisoAutomatico"/);
    assert.match(htmlHoja, /Cada noche \(02:00\)/);
    assert.match(jsHoja, /avisoHojaRuta/);
    assert.match(jsHoja, /aviso_hoja_ruta, aviso_hoja_ruta_en/);

    const panel = leer('frontend/pages/cooperativa/index.html');
    assert.match(panel, /id="avisosHojaRuta"/);
    assert.match(panel, /gruposConAviso\(grupos\.data\)/);
    assert.match(panel, /pintarAvisosHojaRuta\(datos\.avisos\)/);
});

/* ------------------------------ Corrección del detalle por grupo ------------------------------ */

const CORRECCION = 'supabase/migrations/20261128090000_detalle_hoja_ruta_automatica.sql';

test('corrección: una sola transacción y exige la versión aplicada', () => {
    const sql = leer(CORRECCION);
    assert.equal((sql.match(/^begin;/gm) ?? []).length, 1);
    assert.equal((sql.match(/^commit;/gm) ?? []).length, 1);
    assert.ok(sql.trimEnd().endsWith('commit;'));
    assert.match(sql, /to_regprocedure\('public\.generar_hojas_ruta_automaticas\(integer\)'\)/);
    assert.match(sql, /no es la esperada\. Envía su definición/);
    // No toca las tareas programadas.
    assert.doesNotMatch(sql, /cron\.(un)?schedule/);
});

test('corrección: generados y conservados van dentro del objeto del grupo', () => {
    const tarea = cuerpo(leer(CORRECCION), 'generar_hojas_ruta_automaticas');

    assert.match(tarea, /v_detalle := v_detalle \|\| jsonb_build_array\(\s*jsonb_build_object\([^;]*'resultado', 'generado'[^;]*\)\s*\|\| v_resultado\s*\);/);
    // Ya no queda la forma que agregaba v_resultado como elemento suelto.
    assert.doesNotMatch(tarea, /'hasta', v_hasta\)\s*\|\|\s*v_resultado;/);

    // El resto de la función sigue igual.
    assert.match(tarea, /v_desde := greatest\(v_hoy, coalesce\(v_ultimo \+ 1, v_hoy\)\);/);
    assert.match(tarea, /set aviso_hoja_ruta = v_aviso,\s*aviso_hoja_ruta_en = now\(\)/);
    assert.match(leer(CORRECCION), /revoke all on function public\.generar_hojas_ruta_automaticas\(int\) from public, anon, authenticated;/);
});

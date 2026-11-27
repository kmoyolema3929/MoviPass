// Ejecutar: node --test tests/usuarioBus.test.cjs
// Cambio 4, parte 4.3: app del usuario bus (iniciar, validar, vender en ruta,
// manifiesto, finalizar, recaudación en camino e historial).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const operacion = () => import('../frontend/js/reglasOperacion.js');
const leer = (ruta) => readFileSync(join(__dirname, '..', ruta), 'utf8');
const MIGRACION = 'supabase/migrations/20261126090000_app_usuario_bus.sql';

/* ------------------------------ Estado del viaje ------------------------------ */

test('pendiente de inicio: solo iniciar; validar y vender bloqueados', async () => {
    const { accionesDelViaje } = await operacion();

    const a = accionesDelViaje({ estado_operativo: 'pendiente_inicio', estado_hoja: 'Programado' });
    assert.equal(a.iniciar, true);
    assert.equal(a.validar, false);
    assert.equal(a.vender, false);
    assert.equal(a.finalizar, false);
    assert.equal(a.manifiesto, true);
    assert.match(a.aviso, /Inicia el viaje/);

    // Cancelado en la hoja de ruta: no se inicia.
    const cancelado = accionesDelViaje({ estado_operativo: 'pendiente_inicio', estado_hoja: 'Cancelado' });
    assert.equal(cancelado.iniciar, false);
    assert.match(cancelado.aviso, /cancelado/);
});

test('en curso: validar, vender y finalizar; finalizado: todo cerrado', async () => {
    const { accionesDelViaje } = await operacion();

    const enCurso = accionesDelViaje({ estado_operativo: 'en_curso' });
    assert.deepEqual(
        [enCurso.iniciar, enCurso.validar, enCurso.vender, enCurso.finalizar, enCurso.reporte],
        [false, true, true, true, true]
    );
    assert.equal(enCurso.aviso, '');

    const fin = accionesDelViaje({ estado_operativo: 'finalizado' });
    assert.deepEqual([fin.iniciar, fin.validar, fin.vender, fin.finalizar, fin.reporte], [false, false, false, false, true]);
    assert.match(fin.aviso, /cerradas/);

    // Sin habilitación (programado o desconocido): nada.
    const programado = accionesDelViaje({ estado_operativo: 'programado' });
    assert.equal(programado.validar || programado.vender || programado.iniciar || programado.manifiesto, false);
    assert.match(programado.aviso, /oficina/);
});

test('mensaje claro cuando no hay viajes hoy', async () => {
    const { textoMisViajes } = await operacion();
    assert.equal(textoMisViajes(0), 'Hoy no tienes viajes asignados.');
    assert.equal(textoMisViajes(1), 'Tienes 1 viaje hoy.');
    assert.equal(textoMisViajes(3), 'Tienes 3 viajes hoy.');
});

test('hora real en hora de Ecuador (UTC-5)', async () => {
    const { horaReal } = await operacion();
    assert.equal(horaReal('2026-11-20T13:05:00Z'), '08:05');
    assert.equal(horaReal('2026-11-21T03:40:00+00:00'), '22:40');
    assert.equal(horaReal(null), '');
    assert.equal(horaReal('no es fecha'), '');
});

/* --------------------------------- Validar --------------------------------- */

test('código del boleto: mayúsculas, sin espacios y con prefijo MP-', async () => {
    const { normalizarCodigoBoleto, revisarCodigoBoleto } = await operacion();

    assert.equal(normalizarCodigoBoleto(' mp-1a2b3c4d5e '), 'MP-1A2B3C4D5E');
    assert.equal(normalizarCodigoBoleto('1a2b 3c4d5e'), 'MP-1A2B3C4D5E');
    assert.equal(normalizarCodigoBoleto(''), '');

    assert.equal(revisarCodigoBoleto('MP-1A2B3C4D5E'), '');
    assert.match(revisarCodigoBoleto('   '), /Escribe el código/);
    assert.match(revisarCodigoBoleto('MP-<script>'), /no es válido/);
    assert.match(revisarCodigoBoleto('A'.repeat(41)), /no es válido/);
});

test('resultado de la validación y tarifa pagada en grande', async () => {
    const { resultadoValidacion, textoTarifaPagada } = await operacion();

    assert.equal(resultadoValidacion('abordado').titulo, 'PUEDE ABORDAR');
    assert.equal(resultadoValidacion('abordado').clase, 'resultado-ok');
    assert.equal(resultadoValidacion('ya_abordo').clase, 'resultado-aviso');
    ['otro_viaje', 'no_pagado', 'anulado', 'no_existe'].forEach((r) =>
        assert.equal(resultadoValidacion(r).clase, 'resultado-error', r));

    assert.equal(textoTarifaPagada({ tarifa: 'Tercera edad', descuento: 50 }), 'TERCERA EDAD (−50 %)');
    assert.equal(textoTarifaPagada({ tarifa: 'Niño', descuento: 50 }), 'NIÑO (−50 %)');
    assert.equal(textoTarifaPagada({ tarifa: 'Adulto', descuento: 0 }), 'ADULTO (tarifa normal)');
    assert.equal(textoTarifaPagada(null), '');
});

/* -------------------------------- Manifiesto -------------------------------- */

const BOLETOS = [
    { id: 'a', numero_asiento: 7, cedula: '1710034065', nombres: 'Ana', apellidos: 'Loor', estado: 'abordado' },
    { id: 'b', numero_asiento: 2, cedula: '0926687856', nombres: 'Luis', apellidos: 'Paz', estado: 'emitido' },
    { id: 'c', numero_asiento: 5, cedula: '1104680135', nombres: 'Rosa', apellidos: 'Mora', estado: 'reservado' }
];

test('manifiesto: filtros por estado, cédula o nombre, ordenado por asiento', async () => {
    const { filtrarManifiesto, estadoBoleto } = await operacion();

    assert.deepEqual(filtrarManifiesto(BOLETOS).map((b) => b.numero_asiento), [2, 5, 7]);
    assert.deepEqual(filtrarManifiesto(BOLETOS, { estado: 'emitido' }).map((b) => b.id), ['b']);
    assert.deepEqual(filtrarManifiesto(BOLETOS, { texto: '0926' }).map((b) => b.id), ['b']);
    assert.deepEqual(filtrarManifiesto(BOLETOS, { texto: 'ROSA' }).map((b) => b.id), ['c']);
    assert.deepEqual(filtrarManifiesto(BOLETOS, { estado: 'abordado', texto: 'paz' }), []);

    assert.equal(estadoBoleto('abordado').texto, 'Abordó');
    assert.equal(estadoBoleto('reservado').texto, 'Sin pagar');
});

test('manifiesto: el asiento de quien abordó sigue ocupado', async () => {
    const { conteoManifiesto } = await operacion();
    assert.deepEqual(conteoManifiesto(BOLETOS, 40), { abordados: 1, porAbordar: 1, sinPagar: 1, libres: 37 });
    assert.equal(conteoManifiesto(BOLETOS, 2).libres, 0);
});

/* ------------------------------- Venta en ruta ------------------------------- */

test('parada donde sube: el origen y las paradas en orden (sin el destino)', async () => {
    const { opcionesParada, revisarParada } = await operacion();

    const opciones = opcionesParada({
        origen: 'Ambato', destino: 'Quito',
        paradas: [
            { id: 9, nombre: 'Latacunga', hora_estimada: '10:30:00', orden: 2 },
            { id: 4, nombre: 'Salcedo', hora_estimada: '10:05:00', orden: 1 }
        ]
    });

    assert.deepEqual(opciones.map((o) => o.codigo), ['origen', '4', '9']);
    assert.equal(opciones[0].nombre, 'Ambato (origen)');
    assert.equal(opciones[1].nombre, 'Salcedo (10:05)');
    assert.equal(opciones.some((o) => /Quito/.test(o.nombre)), false);

    assert.equal(revisarParada('9', opciones), '');
    assert.match(revisarParada('', opciones), /Elige la parada/);
    assert.match(revisarParada('77', opciones), /no pertenece/);
    assert.deepEqual(opcionesParada(null), []);
});

test('precio en ruta (opción A): precio completo del viaje con el descuento de la tarifa', async () => {
    const { resumenCobro } = await import('../frontend/js/reglasCompra.js');
    const tipos = [
        { codigo: 'normal', nombre: 'Adulto', descuento: 0 },
        { codigo: 'tercera_edad', nombre: 'Tercera edad', descuento: 50 }
    ];
    const r = resumenCobro(8.5, [{ numero_asiento: 1, tipo: 'normal' }, { numero_asiento: 2, tipo: 'tercera_edad' }], tipos);
    assert.equal(r.total, 12.75);

    // La base usa la misma regla: _preparar_pasajeros con el precio del viaje.
    const sql = leer(MIGRACION);
    const vender = sql.slice(sql.indexOf('function public.vender_en_ruta'), sql.indexOf('-- 8. Recaudación'));
    assert.match(vender, /_preparar_pasajeros\(p_viaje_id, p_pasajeros\)/);
    assert.match(vender, /'efectivo', 'aprobada', 'EN_RUTA'/);
    assert.match(vender, /_exigir_viaje_en_curso/);
    assert.match(vender, /Elige la parada donde sube el pasajero/);
});

/* -------------------------------- Recaudación -------------------------------- */

test('recaudación en ruta: total en efectivo y por tarifa, en centavos', async () => {
    const { resumenRecaudacion } = await operacion();

    const r = resumenRecaudacion([
        { tarifa: 'Adulto', precio: 0.1 },
        { tarifa: 'Adulto', precio: 0.2 },
        { tarifa: 'Tercera edad', precio: 4.25 }
    ]);

    assert.equal(r.pasajeros, 3);
    assert.equal(r.total, 4.55);
    assert.deepEqual(r.porTarifa, [
        { tarifa: 'Adulto', pasajeros: 2, total: 0.3 },
        { tarifa: 'Tercera edad', pasajeros: 1, total: 4.25 }
    ]);
    assert.deepEqual(resumenRecaudacion([]), { pasajeros: 0, total: 0, porTarifa: [] });
});

test('rango de fechas de los reportes: obligatorio y de hasta 92 días, igual que la base', async () => {
    const { revisarRangoFechas, MAX_DIAS_REPORTE } = await operacion();

    assert.deepEqual(revisarRangoFechas('2026-11-01', '2026-11-20'), { desde: '', hasta: '' });
    assert.match(revisarRangoFechas('', '2026-11-20').desde, /desde/);
    assert.match(revisarRangoFechas('2026-11-01', '').hasta, /hasta/);
    assert.match(revisarRangoFechas('2026-11-20', '2026-11-01').hasta, /anterior/);
    assert.equal(revisarRangoFechas('2026-08-20', '2026-11-20').hasta, '');
    assert.match(revisarRangoFechas('2026-08-19', '2026-11-20').hasta, /92 días/);

    assert.equal(MAX_DIAS_REPORTE, 92);
    assert.match(leer(MIGRACION), /p_hasta - p_desde > 92/);
});

/* --------------------------------- Migración --------------------------------- */

test('migración: una sola transacción, sin tablas nuevas', () => {
    const sql = leer(MIGRACION);
    assert.equal((sql.match(/^begin;$/gm) ?? []).length, 1);
    assert.equal((sql.match(/^commit;$/gm) ?? []).length, 1);
    assert.doesNotMatch(sql, /create table/i);
    assert.doesNotMatch(sql, /@@FUNCIONES_DE_LA_NUBE@@/);
});

test('migración: "abordado" mantiene el asiento ocupado en el índice y en las funciones', () => {
    const sql = leer(MIGRACION);

    assert.match(sql, /check \(estado in \('reservado', 'emitido', 'abordado', 'anulado'\)\)/);
    assert.match(sql, /create unique index boletos_asiento_activo_uq[\s\S]*?where estado in \('reservado', 'emitido', 'abordado'\);/);

    ['asientos_ocupados', 'bus_tiene_boletos_pendientes', 'exigir_boletos_sin_cambios', 'obtener_hoja_ruta', 'reemplazar_con_reten']
        .forEach((nombre) => {
            const inicio = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nombre}(`);
            assert.ok(inicio > 0, nombre);
            const cuerpo = sql.slice(inicio, sql.indexOf('$function$;', inicio));
            assert.match(cuerpo, /in \('reservado', 'emitido', 'abordado'\)/, nombre);
            assert.doesNotMatch(cuerpo, /in \('reservado', 'emitido'\)/, nombre);
        });

    // Antes de reemplazarlas se comprueba que la nube tenga las esperadas.
    assert.match(sql, /no es la esperada\. Envía su definición/);
});

test('migración: validar devuelve resultados claros y solo en los viajes asignados', () => {
    const sql = leer(MIGRACION);
    const validar = sql.slice(sql.indexOf('function public.validar_boleto'), sql.indexOf('-- 7. Venta en ruta'));

    ['no_existe', 'otro_viaje', 'anulado', 'no_pagado', 'ya_abordo', 'abordado'].forEach((r) =>
        assert.match(validar, new RegExp(`'${r}'`), r));
    assert.match(validar, /ya abordó a las %s/);
    assert.match(validar, /_mi_viaje_asignado\(p_viaje_id\)/);
    assert.match(validar, /_exigir_viaje_en_curso/);
    assert.match(validar, /set estado = 'abordado',\s+abordado_en = now\(\)/);

    assert.match(sql, /v_viaje\.usuario_bus_id is distinct from auth\.uid\(\)/);
    assert.match(sql, /mientras está pendiente de inicio no se puede validar ni vender/);
    assert.match(sql, /set estado_operativo = 'en_curso',\s+salida_real = now\(\)/);
    assert.match(sql, /set estado_operativo = 'finalizado',\s+llegada_real/);
});

test('migración: boletos en Realtime y lectura del usuario bus solo de sus viajes', () => {
    const sql = leer(MIGRACION);
    assert.match(sql, /alter publication supabase_realtime add table public\.boletos/);
    assert.match(sql, /create policy "usuario bus ve boletos de sus viajes"/);
    assert.match(sql, /v\.usuario_bus_id = auth\.uid\(\)/);
    // Recaudación: usuario bus del viaje, oficinista o gerente (exigir_despachador).
    assert.match(sql, /function public\._exigir_lector_del_viaje[\s\S]*?exigir_despachador\(v_cooperativa\)/);
    assert.match(sql, /co\.origen = 'EN_RUTA'/);
});

/* --------------------------------- Pantallas --------------------------------- */

test('el rol bus entra a su propia app, no a la gestión de buses', () => {
    for (const archivo of ['frontend/js/auth.js', 'frontend/js/navSesion.js']) {
        const codigo = leer(archivo);
        assert.match(codigo, /bus: new URL\('\.\.\/pages\/usuario-bus\/index\.html'/, archivo);
        assert.doesNotMatch(codigo, /bus: new URL\('\.\.\/pages\/bus\/buses\.html'/, archivo);
    }
});

test('app del usuario bus: rol bus, cámara, código, cédula, manifiesto y Realtime', () => {
    const html = leer('frontend/pages/usuario-bus/viaje.html');
    const js = leer('frontend/pages/usuario-bus/viaje.js');

    assert.match(js, /exigirRoles\(\['bus'\]\)/);
    assert.match(html, /html5-qrcode@2\.3\.8/);
    assert.match(html, />Código del boleto \*</);
    assert.match(html, />Cédula del pasajero \*</);
    assert.match(html, />Parada donde sube \*</);
    assert.match(html, />Buscar \(opcional\)</);
    assert.match(html, /\* Campo obligatorio/);
    assert.match(js, /rpc\('validar_boleto'/);
    assert.match(js, /rpc\('vender_en_ruta'/);
    assert.match(js, /table: 'boletos', filter: `viaje_id=eq\.\$\{viajeId\}`/);
    assert.match(js, /origen: 'EN_RUTA'/);
    assert.match(leer('frontend/pages/usuario-bus/index.js'), /exigirRoles\(\['bus'\]\)/);
});

test('recaudación: PDF y visible para el usuario bus, el oficinista y el gerente', () => {
    const html = leer('frontend/pages/usuario-bus/recaudacion.html');
    const js = leer('frontend/pages/usuario-bus/recaudacion.js');
    assert.match(html, /jspdf/);
    assert.match(js, /exigirRoles\(\['bus', 'oficinista', 'cooperativa', 'administrador'\]\)/);
    assert.match(js, /doc\.save\(/);

    assert.match(leer('frontend/pages/oficinista/recaudacion-ruta.js'), /exigirRoles\(\['oficinista', 'cooperativa', 'administrador'\]\)/);
    assert.match(leer('frontend/pages/oficinista/index.html'), /href="recaudacion-ruta\.html"/);
    assert.match(leer('frontend/pages/cooperativa/index.html'), /href="\.\.\/oficinista\/recaudacion-ruta\.html"/);
    assert.match(leer('frontend/pages/oficinista/recaudacion-ruta.html'), />Desde \*</);
    assert.match(leer('frontend/pages/usuario-bus/historial.html'), />Hasta \*</);
});

test('el cliente sigue viendo el QR de su boleto después de abordar', () => {
    assert.match(leer('frontend/js/boleto.js'), /const CON_QR = \['emitido', 'abordado'\]/);
});

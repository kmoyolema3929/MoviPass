// Ejecutar: node --test tests/operacionOficina.test.cjs
// Cambio 4, parte 4.1: venta en ventanilla, bandeja de comprobantes con aviso
// en tiempo real y despacho del día.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const compra = () => import('../frontend/js/reglasCompra.js');
const operacion = () => import('../frontend/js/reglasOperacion.js');
const boleto = () => import('../frontend/js/boletoImpreso.js');
const leer = ruta => readFileSync(join(__dirname, '..', ruta), 'utf8');

const TIPOS = [
    { codigo: 'normal', nombre: 'Adulto', descuento: 0 },
    { codigo: 'nino', nombre: 'Niño', descuento: 50 },
    { codigo: 'tercera_edad', nombre: 'Tercera edad', descuento: 50 }
];

/* ---------------------------- Precio y resumen ---------------------------- */

test('precio con descuento: igual que la base (round a 2 decimales)', async () => {
    const { precioConDescuento } = await compra();

    assert.equal(precioConDescuento(12.5, 0), 12.5);
    assert.equal(precioConDescuento(12.5, 50), 6.25);
    assert.equal(precioConDescuento(7.35, 50), 3.68); // 3.675 -> 3.68
    assert.equal(precioConDescuento('10.10', 33.33), 6.73);
    assert.equal(precioConDescuento(10, 120), 0); // nunca negativo
    assert.equal(precioConDescuento(null), 0);
});

test('resumen del cobro: tarifa normal, descuentos y total', async () => {
    const { resumenCobro } = await compra();

    const r = resumenCobro(12.5, [
        { numero_asiento: 3, tipo: 'normal' },
        { numero_asiento: 4, tipo: 'nino' },
        { numero_asiento: 5, tipo: 'tercera_edad' }
    ], TIPOS);

    assert.deepEqual(r.lineas.map((l) => [l.numero_asiento, l.tarifa, l.precio]), [
        [3, 'Adulto', 12.5], [4, 'Niño', 6.25], [5, 'Tercera edad', 6.25]
    ]);
    assert.equal(r.subtotal, 37.5);
    assert.equal(r.descuento, 12.5);
    assert.equal(r.total, 25);

    // Sin pasajeros: todo en cero.
    assert.deepEqual(resumenCobro(12.5, [], TIPOS), { lineas: [], subtotal: 0, descuento: 0, total: 0 });
    // Tarifa desconocida: sin descuento (la base la rechaza).
    assert.equal(resumenCobro(10, [{ numero_asiento: 1, tipo: 'otra' }], TIPOS).total, 10);
});

test('máximo de asientos por venta: 10, igual que la base', async () => {
    const { MAX_ASIENTOS_COMPRA } = await compra();
    assert.equal(MAX_ASIENTOS_COMPRA, 10);
    assert.match(leer('supabase/migrations/20261123090000_operacion_oficina.sql'), /v_cantidad < 1 or v_cantidad > 10/);
});

/* ------------------------------- Ventanilla ------------------------------- */

test('ventanilla: solo viajes que aún no salen, sin iniciar ni finalizar', async () => {
    const { viajesVendibles } = await operacion();
    const viaje = (id, fecha, hora, extra = {}) => ({ id, fecha, frecuencias: { hora }, hojas_ruta: { estado: 'Programado' }, estado_operativo: 'programado', ...extra });

    const lista = viajesVendibles([
        viaje('tarde', '2026-11-16', '18:00:00'),
        viaje('salio', '2026-11-16', '08:00:00'),
        viaje('manana', '2026-11-17', '06:00:00'),
        viaje('en-curso', '2026-11-16', '20:00:00', { estado_operativo: 'en_curso' }),
        viaje('final', '2026-11-16', '21:00:00', { estado_operativo: 'finalizado' }),
        viaje('cancelado', '2026-11-16', '22:00:00', { hojas_ruta: { estado: 'Cancelado' } }),
        viaje('pendiente', '2026-11-16', '12:30:00', { estado_operativo: 'pendiente_inicio' }),
        viaje('sin-hoja', '2026-11-16', '23:00:00', { hojas_ruta: null })
    ], '2026-11-16', '12:00');

    assert.deepEqual(lista.map((v) => v.id), ['pendiente', 'tarde', 'sin-hoja', 'manana']);
});

test('hora de Ecuador en formato HH:MM (UTC-5)', async () => {
    const { horaEcuador } = await operacion();
    assert.equal(horaEcuador(new Date('2026-11-16T17:05:00Z')), '12:05');
    assert.equal(horaEcuador(new Date('2026-11-17T03:30:00Z')), '22:30');
});

test('vender_en_oficina guarda origen OFICINA y no vende viajes en curso o finalizados', () => {
    const sql = leer('supabase/migrations/20261123090000_operacion_oficina.sql');

    assert.match(sql, /'efectivo', 'aprobada', 'OFICINA'/);
    assert.match(sql, /Este viaje ya terminó/);
    assert.match(sql, /v_operativo = 'en_curso' or \(v_fecha \+ v_hora\)/);
    assert.match(sql, /where t\.codigo = v_tipo\s+and t\.activo/);
});

test('la pantalla de venta usa la fecha de Ecuador, las tarifas activas y el boleto con QR', () => {
    const js = leer('frontend/pages/oficinista/vender.js');
    const html = leer('frontend/pages/oficinista/vender.html');

    assert.match(js, /fechaHoyEcuador\(\)/);
    assert.doesNotMatch(js, /fechaLocalISO/);
    assert.match(js, /t\.activo !== false/);
    assert.match(js, /crearBoletoImpreso\(datosBoleto\(b, datosViaje, \{ tipos, origen: 'OFICINA' \}\)\)/);
    assert.match(js, /rpc\('buscar_pasajero'/); // autocompletar por cédula
    assert.match(html, /qrcodejs@1\.0\.0\/qrcode\.min\.js/);
    assert.match(html, /css\/boleto\.css/);
    assert.match(html, /id="resultado" class="d-none zona-impresion"/);
});

/* --------------------------------- Boleto --------------------------------- */

test('datos del boleto impreso: QR con el código único y datos del viaje y del pasajero', async () => {
    const { datosBoleto } = await boleto();

    const d = datosBoleto(
        { codigo: 'MP-ABC123DEF4', numero_asiento: 7, pasajero: 'Ana Pérez', cedula: '1712345675', tipo: 'tercera_edad', precio: 6.25 },
        { origen: 'Ambato', destino: 'Quito', fecha: '2026-11-16', hora: '18:30:00', bus: '12 (PBA-1234)', cooperativa: 'Flota Ejemplo' },
        { tipos: TIPOS, origen: 'OFICINA' }
    );

    assert.deepEqual(d, {
        codigo: 'MP-ABC123DEF4',
        ruta: 'Ambato → Quito',
        fecha: '16/11/2026',
        hora: '18:30',
        bus: '12 (PBA-1234)',
        cooperativa: 'Flota Ejemplo',
        asiento: '7',
        pasajero: 'Ana Pérez',
        cedula: '1712345675',
        tarifa: 'Tercera edad',
        precio: '$6.25',
        origen: 'Venta en oficina'
    });

    // Columnas de la tabla boletos (bandeja y cliente) y sin tipos cargados.
    const t = datosBoleto({ codigo: 'MP-1', numero_asiento: 2, pasajero_nombres: 'Luis', pasajero_apellidos: 'Loor', pasajero_cedula: '0912345675', tipo_pasajero: 'nino', precio: '5' });
    assert.equal(t.pasajero, 'Luis Loor');
    assert.equal(t.cedula, '0912345675');
    assert.equal(t.tarifa, 'Niño');
    assert.equal(t.precio, '$5.00');
    assert.equal(t.ruta, '—');
});

/* ------------------------- Bandeja de comprobantes ------------------------- */

test('aviso en tiempo real: solo cuando llega un comprobante que no estaba en la bandeja', async () => {
    const { esComprobanteNuevo } = await operacion();
    const enBandeja = new Set(['a']);

    assert.equal(esComprobanteNuevo({ eventType: 'UPDATE', new: { id: 'b', estado: 'pendiente_validacion' } }, enBandeja), true);
    assert.equal(esComprobanteNuevo({ eventType: 'UPDATE', new: { id: 'a', estado: 'pendiente_validacion' } }, enBandeja), false);
    assert.equal(esComprobanteNuevo({ eventType: 'UPDATE', new: { id: 'b', estado: 'aprobada' } }, enBandeja), false);
    assert.equal(esComprobanteNuevo({ eventType: 'INSERT', new: { id: 'c', estado: 'pendiente_comprobante' } }, enBandeja), false);
    assert.equal(esComprobanteNuevo({ eventType: 'DELETE', old: { id: 'a' }, new: {} }, enBandeja), false);
    assert.equal(esComprobanteNuevo(null), false);
});

test('contador de pendientes en texto', async () => {
    const { textoPendientes } = await operacion();
    assert.equal(textoPendientes(0), 'No hay comprobantes por revisar');
    assert.equal(textoPendientes(1), '1 comprobante por revisar');
    assert.equal(textoPendientes(4), '4 comprobantes por revisar');
});

test('la bandeja escucha compras por Realtime y la tabla está en la publicación', () => {
    const js = leer('frontend/pages/oficinista/validar-pagos.js');
    const sql = leer('supabase/migrations/20261123090000_operacion_oficina.sql');

    assert.match(js, /\.channel\(`comprobantes-\$\{id\}`\)/);
    assert.match(js, /table: 'compras', filter: `cooperativa_id=eq\.\$\{id\}`/);
    assert.match(js, /setInterval\(recargar, 60000\)/); // respaldo si se corta el aviso
    assert.match(js, /rpc\('rechazar_pago'/);
    assert.match(sql, /alter publication supabase_realtime add table public\.compras/);
});

/* ---------------------------- Despacho del día ---------------------------- */

const USUARIOS = [
    { id: 'u1', nombres: 'Pedro', apellidos: 'Chofer', funcion_bus: 'chofer' },
    { id: 'u2', nombres: 'Rosa', apellidos: 'Dueña', funcion_bus: 'dueno' }
];

test('usuario bus por defecto: el habilitado o el del bus, si está activo', async () => {
    const { usuarioBusPorDefecto } = await operacion();

    assert.equal(usuarioBusPorDefecto({ bus: { usuario_bus_id: 'u2' } }, USUARIOS), 'u2');
    assert.equal(usuarioBusPorDefecto({ usuario_bus: { id: 'u1' }, bus: { usuario_bus_id: 'u2' } }, USUARIOS), 'u1');
    assert.equal(usuarioBusPorDefecto({ bus: { usuario_bus_id: 'inactivo' } }, USUARIOS), '');
    assert.equal(usuarioBusPorDefecto({ bus: { usuario_bus_id: null } }, USUARIOS), '');
});

test('validación del usuario bus y de los viajes que se pueden habilitar', async () => {
    const { revisarUsuarioBus, motivoNoHabilitable } = await operacion();

    assert.equal(revisarUsuarioBus('u1', USUARIOS), '');
    assert.equal(revisarUsuarioBus('', USUARIOS), 'Elige el usuario bus que hará este viaje.');
    assert.match(revisarUsuarioBus('otro', USUARIOS), /ya no está activo/);

    assert.equal(motivoNoHabilitable({ estado_operativo: 'programado', estado_hoja: 'Programado' }), '');
    assert.equal(motivoNoHabilitable({ estado_operativo: 'pendiente_inicio' }), '');
    assert.equal(motivoNoHabilitable({ estado_operativo: 'en_curso' }), 'El viaje ya está en curso.');
    assert.equal(motivoNoHabilitable({ estado_operativo: 'finalizado' }), 'El viaje ya terminó.');
    assert.match(motivoNoHabilitable({ estado_operativo: 'programado', estado_hoja: 'Cancelado' }), /cancelado/);
});

test('textos del despacho: estado, tipo de viaje, bus y usuario bus', async () => {
    const { estadoOperativo, textoTipoViaje, textoBus, textoUsuarioBus } = await operacion();

    assert.equal(estadoOperativo('pendiente_inicio').texto, 'Pendiente de inicio');
    assert.equal(estadoOperativo('raro').texto, 'raro');
    assert.equal(textoTipoViaje('directa'), 'Directa');
    assert.equal(textoTipoViaje('compartida'), 'Con paradas');
    assert.equal(textoBus({ numero_interno: '12', placa: 'PBA-1234' }), '12 (PBA-1234)');
    assert.equal(textoBus(null), '—');
    assert.equal(textoUsuarioBus(USUARIOS[1]), 'Dueña, Rosa (dueño)');
    assert.equal(textoUsuarioBus(null), '');
});

test('migración: estado operativo nuevo en viajes, sin tablas nuevas, en una transacción', () => {
    const sql = leer('supabase/migrations/20261123090000_operacion_oficina.sql');

    assert.match(sql, /^begin;$/m);
    assert.match(sql, /^commit;$/m);
    assert.doesNotMatch(sql, /create table/i);
    assert.match(sql, /check \(estado_operativo in \('programado', 'pendiente_inicio', 'en_curso', 'finalizado'\)\)/);
    assert.match(sql, /check \(origen in \('APP', 'OFICINA', 'EN_RUTA'\)\)/);
    assert.match(sql, /set origen = case when vendedor_id is not null then 'OFICINA' else 'APP' end/);
    // Habilitar: solo hoy (fecha de Ecuador), usuario bus activo de la misma cooperativa.
    assert.match(sql, /v_viaje\.fecha <> public\.fecha_hoy_ecuador\(\)/);
    assert.match(sql, /p\.rol = 'bus'\s+and p\.estado = 'activo'\s+and cu\.cooperativa_id = v_cooperativa/);
    assert.match(sql, /set estado_operativo = 'pendiente_inicio'/);
    // Las funciones nuevas no se pueden llamar sin sesión.
    assert.match(sql, /'public\.habilitar_viaje\(uuid, uuid\)'/);
    assert.match(sql, /revoke all on function %s from public, anon'/);
});

test('despacho: pantalla con asterisco, mensaje junto al campo y nota de obligatorio', () => {
    const js = leer('frontend/pages/oficinista/despacho.js');
    const panel = leer('frontend/pages/oficinista/index.html');

    assert.match(js, /'Usuario bus \*'/);
    assert.match(js, /dataset\.campo = 'usuario_bus'/);
    assert.match(js, /dataset\.error = 'usuario_bus'/);
    assert.match(js, /\* Campo obligatorio/);
    assert.match(js, /rpc\('habilitar_viaje'/);
    assert.match(js, /rpc\('quitar_habilitacion'/);
    assert.match(panel, /href="despacho\.html"/);
    assert.match(panel, /id="badgePendientes"/);
});

/* ------------- Operación de rutas compartida (gerente y oficinista) ------------- */

test('frecuencias: el oficinista de la cooperativa gestiona igual que el gerente', () => {
    const sql = leer('supabase/migrations/20261123090000_operacion_oficina.sql');

    // Permiso de guardar_frecuencia, eliminar_frecuencia y ordenar_frecuencias.
    assert.match(sql, /create or replace function public\.exigir_gestor_de_frecuencias[\s\S]*?rol_actual\(\) in \('cooperativa', 'oficinista'\) and public\.es_de_mi_cooperativa\(p_cooperativa_id\)/);
    // Paradas (sus políticas usan puede_gestionar_frecuencia).
    assert.match(sql, /create or replace function public\.puede_gestionar_frecuencia[\s\S]*?rol_actual\(\) in \('cooperativa', 'oficinista'\)\s+and f\.cooperativa_id is not null/);
    // Escritura directa (activar o desactivar) en las tres políticas.
    for (const politica of ['crear', 'editar', 'eliminar']) {
        assert.match(sql, new RegExp(`create policy "${politica} frecuencias autorizadas"[\\s\\S]*?in \\('cooperativa', 'oficinista'\\)`));
    }
    // Se comprueba la versión de la nube antes de reemplazar.
    assert.match(sql, /no es la esperada\. Envía su definición/);
    assert.match(sql, /regexp_replace\(p\.prosrc, '\\s\+', ' ', 'g'\)/);
    // Grupos, plantillas, buses y personal no cambian.
    assert.doesNotMatch(sql, /on public\.(grupos_bus|buses|plantillas_bus|cooperativas_usuarios)\b[^;]*policy|policy[^;]*on public\.(grupos_bus|buses|plantillas_bus|cooperativas_usuarios)\b/i);
});

test('pantallas: frecuencias para el oficinista y despacho para el gerente', () => {
    const frecuencias = leer('frontend/pages/frecuencias/frecuencias.js');
    const hojaRuta = leer('frontend/pages/frecuencias/hoja-ruta.js');
    const despacho = leer('frontend/pages/oficinista/despacho.js');

    assert.match(frecuencias, /exigirRoles\(\['administrador', 'cooperativa', 'oficinista'\]\)/);
    assert.match(frecuencias, /if \(rol !== 'administrador'\) consulta = consulta\.in\('cooperativa_id'/);
    assert.doesNotMatch(hojaRuta, /enlaceFrecuencias'\)\.classList\.add\('d-none'\)/);
    assert.match(hojaRuta, /exigirRoles\(\['administrador', 'cooperativa', 'oficinista'\]\)/); // sigue igual
    assert.match(despacho, /exigirRoles\(\['oficinista', 'cooperativa'\]\)/);

    assert.match(leer('frontend/pages/oficinista/index.html'), /href="\.\.\/frecuencias\/gestor-frecuencias\.html"/);
    assert.match(leer('frontend/pages/cooperativa/index.html'), /href="\.\.\/oficinista\/despacho\.html"/);
    // La base ya permitía despachar a los dos.
    assert.match(leer('supabase/migrations/20261123090000_operacion_oficina.sql'),
        /public\.rol_actual\(\) in \('oficinista', 'cooperativa'\)\s+and public\.es_de_mi_cooperativa\(p_cooperativa_id\)/);
});

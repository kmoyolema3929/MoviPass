// Cambio 4, parte 4.2: compra del cliente (número de asientos, ficha por
// pasajero con tarifa, acompañantes de las compras propias y boleto con QR).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const leer = (ruta) => readFileSync(join(__dirname, '..', ruta), 'utf8');
const reglas = () => import('../frontend/js/reglasCompra.js');

test('número de asientos: obligatorio, de 1 a 10 y no más que los libres', async () => {
    const { revisarCantidadAsientos } = await reglas();

    assert.equal(revisarCantidadAsientos(''), 'Indica cuántos asientos necesitas.');
    assert.equal(revisarCantidadAsientos('0'), 'Elige de 1 a 10 asientos.');
    assert.equal(revisarCantidadAsientos('2.5'), 'Elige de 1 a 10 asientos.');
    assert.equal(revisarCantidadAsientos('11'), 'Máximo 10 asientos por compra.');
    assert.equal(revisarCantidadAsientos('4', 3), 'Solo quedan 3 asiento(s) libre(s) en este viaje.');
    assert.equal(revisarCantidadAsientos('1', 0), 'Este viaje ya no tiene asientos libres.');
    assert.equal(revisarCantidadAsientos('3', 40), '');
    assert.equal(revisarCantidadAsientos(10), '');
});

test('mensaje bajo el mapa y ajuste al bajar la cantidad', async () => {
    const { textoSeleccionAsientos, ajustarSeleccion } = await reglas();

    assert.equal(textoSeleccionAsientos(0, 0), 'Primero indica cuántos asientos necesitas.');
    assert.equal(textoSeleccionAsientos(3, 1), 'Elige 2 asientos más en el mapa.');
    assert.equal(textoSeleccionAsientos(2, 1), 'Elige 1 asiento más en el mapa.');
    assert.equal(textoSeleccionAsientos(1, 1), 'Listo: elegiste el asiento.');
    assert.equal(textoSeleccionAsientos(3, 3), 'Listo: elegiste los 3 asientos.');
    assert.equal(textoSeleccionAsientos(1, 2), 'Elegiste más asientos de los que indicaste: quita 1.');

    assert.deepEqual(ajustarSeleccion([4, 7, 9], 2), { seleccion: [4, 7], quitados: [9] });
    assert.deepEqual(ajustarSeleccion([4], 3), { seleccion: [4], quitados: [] });
});

test('autocompletar no pisa lo que escribió el cliente', async () => {
    const { puedeAutocompletar } = await reglas();

    assert.equal(puedeAutocompletar({ nombres: '', apellidos: ' ' }), true);
    assert.equal(puedeAutocompletar({ nombres: 'Ana', apellidos: '' }), false);
    assert.equal(puedeAutocompletar({ nombres: 'Ana', apellidos: 'Paz', autocompletado: true }), true);
});

test('resumen del cliente: tarifa normal, descuentos y total como la base', async () => {
    const { resumenCobro } = await reglas();
    const tipos = [
        { codigo: 'normal', nombre: 'Adulto', descuento: 0 },
        { codigo: 'tercera_edad', nombre: 'Tercera edad', descuento: 50 },
        { codigo: 'nino', nombre: 'Niño', descuento: 50 }
    ];
    const r = resumenCobro(7.25, [
        { numero_asiento: 3, tipo: 'normal' },
        { numero_asiento: 4, tipo: 'tercera_edad' },
        { numero_asiento: 5, tipo: 'nino' }
    ], tipos);

    assert.equal(r.subtotal, 21.75);
    assert.equal(r.total, 14.51); // 7.25 + 3.63 + 3.63
    assert.equal(r.descuento, 7.24);
});

test('migración 4.2: autocompletado solo con las compras de la propia cuenta', () => {
    const sql = leer('supabase/migrations/20261124090000_compra_cliente.sql');

    assert.match(sql, /^begin;/m);
    assert.match(sql, /^commit;/m);
    assert.doesNotMatch(sql, /create table/i);
    assert.match(sql, /create or replace function public\.pasajero_de_mis_compras\(p_cedula text\)/);
    assert.match(sql, /security definer/);
    assert.match(sql, /set search_path to ''/);
    assert.match(sql, /c\.comprador_id = v_usuario/);
    assert.match(sql, /rol_actual\(\) is distinct from 'cliente'/);
    assert.match(sql, /revoke all on function public\.pasajero_de_mis_compras\(text\) from public, anon;/);
    assert.match(sql, /grant execute on function public\.pasajero_de_mis_compras\(text\) to authenticated;/);
    // No cambia funciones que ya existen.
    assert.doesNotMatch(sql, /function public\.(crear_compra_cliente|_preparar_pasajeros|nombres_de_mi_ultimo_boleto)/);
});

test('selección de asientos: número de asientos obligatorio y viaje en venta', () => {
    const html = leer('frontend/pages/seleccion-asientos.html');
    const js = leer('frontend/js/seleccionAsientos.js');

    assert.match(html, />Número de asientos \*</);
    assert.match(html, /id="cantidadAsientos-error" data-error="cantidad"/);
    assert.match(html, /\* Campo obligatorio/);
    assert.match(html, /id="estadoSeleccion"/);

    assert.match(js, /revisarCantidadAsientos/);
    assert.match(js, /viajesVendibles/);
    assert.match(js, /fechaHoyEcuador\(\), horaEcuador\(\)/);
    assert.match(js, /seleccionados\.length !== cantidad/);
    assert.match(js, /t\.activo !== false/);
});

test('ficha de pasajeros: tarifa, autocompletado y resumen con descuentos', () => {
    const html = leer('frontend/pages/compra/resumen-compra.html');
    const js = leer('frontend/js/resumen-compra.js');

    for (const id of ['tarifaNormal', 'subtotalPagar', 'descuentoPagar', 'totalPagar']) {
        assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(js, /supabase\.rpc\('pasajero_de_mis_compras'/);
    assert.match(js, /puedeAutocompletar/);
    assert.match(js, /resumenCobro\(/);
    assert.match(js, /Pasajero \$\{indice \+ 1\}/);
});

test('boleto del cliente: QR con el código, descargable, imprimible y en vivo', () => {
    const html = leer('frontend/pages/compra/boleto.html');
    const js = leer('frontend/js/boleto.js');

    assert.match(html, /css\/boleto\.css/);
    assert.match(html, /qrcodejs@1\.0\.0/);
    assert.match(html, /id="listaBoletos" class="zona-impresion"/);
    assert.match(html, /id="btnImprimir"/);

    assert.match(js, /crearBoletoImpreso\(/);
    assert.match(js, /\{ descargar: true \}/);
    assert.match(js, /window\.print\(\)/);
    assert.match(js, /table: 'compras', filter: `id=eq\.\$\{compraId\}`/);
    assert.doesNotMatch(js, /new QRCode\(/); // el QR lo dibuja boletoImpreso.js
});

/* Ajuste a la 4.2: viajes que ya salieron no se muestran ni se pueden leer. */

test('migración: regla de viaje a la venta y lectura de viajes restringida', () => {
    const sql = leer('supabase/migrations/20261125090000_viajes_en_venta.sql');

    assert.match(sql, /^begin;/m);
    assert.match(sql, /^commit;/m);
    assert.doesNotMatch(sql, /create table/i);
    assert.match(sql, /create or replace function public\.viaje_a_la_venta\(p_viaje_id uuid\)/);
    assert.match(sql, /\(v\.fecha \+ f\.hora\) > \(now\(\) at time zone 'America\/Guayaquil'\)/);
    assert.match(sql, /v\.estado_operativo not in \('en_curso', 'finalizado'\)/);
    assert.match(sql, /h\.estado = 'Programado'/);
    assert.match(sql, /create or replace function public\.a_la_venta\(p_viaje public\.viajes\)/);
    assert.match(sql, /c\.comprador_id = auth\.uid\(\)/);
    assert.match(sql, /drop policy if exists "consulta publica de viajes" on public\.viajes;/);
    assert.match(sql, /when 'cooperativa' then public\.es_mi_bus\(bus_id\)/);
    assert.match(sql, /when 'cliente' then public\.viaje_a_la_venta\(id\) or public\.es_viaje_de_mis_compras\(id\)/);
    assert.match(sql, /when '' then public\.viaje_a_la_venta\(id\)/);
});

test('búsqueda del cliente y ventanilla filtran en la consulta', () => {
    assert.match(leer('frontend/js/consultaBusqueda.js'), /\.eq\('a_la_venta', true\)/);

    const vender = leer('frontend/pages/oficinista/vender.js');
    assert.match(vender, /\.eq\('a_la_venta', true\)/);
    assert.match(vender, /Ya no quedan viajes para hoy con esos filtros\. Prueba con la fecha de mañana\./);
});

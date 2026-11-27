// Ejecutar: node --test tests/formularios.test.cjs
// Cambio 3, parte 3.2: revisión general de formularios (compra, venta,
// comprobante, rechazo de pagos, cooperativas y mensajes de la base).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const compra = () => import('../frontend/js/reglasCompra.js');
const cooperativa = () => import('../frontend/js/reglasCooperativa.js');
const leer = ruta => readFileSync(join(__dirname, '..', ruta), 'utf8');
const MB = 1024 * 1024;

test('pasajero: cédula ecuatoriana válida, nombres y apellidos', async () => {
    const { revisarPasajero } = await compra();

    assert.deepEqual(revisarPasajero({ cedula: '1712345675', nombres: 'Ana Lucía', apellidos: 'Pérez' }), {});
    // 10 dígitos pero con el dígito verificador mal: antes la base lo aceptaba.
    assert.match(revisarPasajero({ cedula: '1712345678', nombres: 'Ana', apellidos: 'Loor' }).cedula, /no es válida/);
    assert.deepEqual(Object.keys(revisarPasajero({ cedula: '', nombres: 'A', apellidos: 'L0or' })).sort(),
        ['apellidos', 'cedula', 'nombres']);
    assert.match(revisarPasajero({ cedula: '1712345675', nombres: 'x'.repeat(81), apellidos: 'Loor' }).nombres, /Máximo 80/);
});

test('pasajero para enviar: textos sin espacios sobrantes', async () => {
    const { pasajeroParaEnviar } = await compra();

    assert.deepEqual(pasajeroParaEnviar(7, { cedula: ' 1712345675 ', nombres: ' Ana   Lucía ', apellidos: 'Pérez  Loor', tipo: 'nino' }), {
        numero_asiento: 7, cedula: '1712345675', nombres: 'Ana Lucía', apellidos: 'Pérez Loor', tipo: 'nino'
    });
});

test('comprobante: solo JPG, PNG, WebP o PDF y máximo 5 MB (igual que el bucket)', async () => {
    const { revisarComprobante, tipoDeComprobante, ACEPTA_COMPROBANTE } = await compra();

    assert.equal(revisarComprobante({ name: 'pago.jpg', type: 'image/jpeg', size: MB }), '');
    assert.equal(revisarComprobante({ name: 'pago.PDF', type: 'application/pdf', size: 5 * MB }), '');
    assert.match(revisarComprobante(null), /Selecciona el comprobante/);
    assert.match(revisarComprobante({ name: 'pago.gif', type: 'image/gif', size: MB }), /JPG, PNG o WebP, o un PDF/);
    assert.match(revisarComprobante({ name: 'pago.docx', type: 'application/vnd.openxmlformats', size: MB }), /JPG/);
    assert.match(revisarComprobante({ name: 'pago.png', type: 'image/png', size: 5 * MB + 1 }), /pesa 5 MB\. El máximo es 5 MB/);
    assert.match(revisarComprobante({ name: 'pago.png', type: 'image/png', size: 7.5 * MB }), /pesa 7,5 MB/);
    assert.match(revisarComprobante({ name: 'pago.png', type: 'image/png', size: 0 }), /vacío/);

    // Sin tipo (algunos navegadores): se usa la extensión.
    assert.equal(revisarComprobante({ name: 'pago.webp', type: '', size: MB }), '');
    assert.match(revisarComprobante({ name: 'pago.exe', type: '', size: MB }), /JPG/);
    assert.equal(tipoDeComprobante({ name: 'pago.jpeg', type: '' }), 'image/jpeg');
    assert.equal(ACEPTA_COMPROBANTE, 'image/jpeg,image/png,image/webp,application/pdf');
});

test('motivo del rechazo: de 3 a 300 caracteres', async () => {
    const { revisarMotivoRechazo } = await compra();

    assert.equal(revisarMotivoRechazo('El monto no coincide'), '');
    assert.match(revisarMotivoRechazo('  ok '), /mínimo 3/);
    assert.match(revisarMotivoRechazo('x'.repeat(301)), /Máximo 300/);
});

test('cooperativa: RUC ecuatoriano', async () => {
    const { rucValido } = await cooperativa();

    assert.equal(rucValido('1790012345001'), true);   // sociedad (tercer dígito 9)
    assert.equal(rucValido('1712345675001'), true);   // persona natural
    assert.equal(rucValido('1760001550001'), true);   // entidad pública
    assert.equal(rucValido('3090012345001'), true);   // provincia 30
    assert.equal(rucValido('1790012345000'), false);  // establecimiento 000
    assert.equal(rucValido('2590012345001'), false);  // provincia 25
    assert.equal(rucValido('0090012345001'), false);  // provincia 00
    assert.equal(rucValido('1770012345001'), false);  // tercer dígito 7
    assert.equal(rucValido('179001234500'), false);   // 12 dígitos
});

test('cooperativa: cada campo obligatorio tiene su mensaje', async () => {
    const { revisarCooperativa, cooperativaParaGuardar, telefonoContactoValido } = await cooperativa();
    const buena = { nombre: ' Cooperativa  Flota Imbabura ', ruc: '1790012345001', direccion: 'Av. Amazonas y Colón', telefono: '02 234-5678' };

    assert.deepEqual(revisarCooperativa(buena), {});
    assert.deepEqual(cooperativaParaGuardar(buena), {
        nombre: 'Cooperativa Flota Imbabura', ruc: '1790012345001', direccion: 'Av. Amazonas y Colón', telefono: '022345678'
    });
    assert.deepEqual(Object.keys(revisarCooperativa({ nombre: 'AB', ruc: '', direccion: 'x', telefono: '' })).sort(),
        ['direccion', 'nombre', 'ruc', 'telefono']);
    assert.match(revisarCooperativa({ ...buena, ruc: '17900123450' }).ruc, /13 dígitos/);
    assert.match(revisarCooperativa({ ...buena, ruc: '1790012345000' }).ruc, /no es válido/);
    assert.match(revisarCooperativa({ ...buena, telefono: '12345' }).telefono, /celular/);

    assert.equal(telefonoContactoValido('0991234567'), true);
    assert.equal(telefonoContactoValido('072345678'), true);
    assert.equal(telefonoContactoValido('012345678'), false);
    assert.equal(telefonoContactoValido('0812345678'), false);
});

test('errores de la base: mensajes propios de la app y nunca texto técnico', async () => {
    const { mensajeErrorBase } = await import('../frontend/js/erroresBase.js');

    assert.equal(mensajeErrorBase(new Error('Debes iniciar sesión.')), 'Debes iniciar sesión.');
    assert.equal(mensajeErrorBase({ code: 'P0001', message: 'La cédula del asiento 4 no es válida.' }),
        'La cédula del asiento 4 no es válida.');
    assert.match(mensajeErrorBase(new Error('JSON object requested, multiple (or no) rows returned'), 'cargar la compra'),
        /^No se pudo cargar la compra/);
    assert.match(mensajeErrorBase({ code: '23514', message: 'new row for relation "x" violates check constraint "y"' }),
        /Algún dato no es válido/);
});

test('pantallas: asterisco, "(opcional)", nota y mensaje junto al campo', () => {
    const pago = leer('frontend/pages/compra/pago.html');
    assert.match(pago, />Comprobante de pago \*</);
    assert.match(pago, /id="errorComprobante"/);
    assert.match(pago, /JPG, PNG, WebP o PDF\. Máximo 5 MB\./);

    const resumen = leer('frontend/pages/compra/resumen-compra.html');
    assert.match(resumen, />Método de pago \*</);
    assert.match(resumen, /id="errorMetodoPago"/);
    for (const archivo of ['frontend/js/resumen-compra.js', 'frontend/pages/oficinista/vender.js']) {
        const codigo = leer(archivo);
        for (const etiqueta of ['Cédula \\*', 'Nombres \\*', 'Apellidos \\*', 'Tipo de pasajero \\*']) {
            assert.match(codigo, new RegExp(`'${etiqueta}'`), `${archivo}: ${etiqueta}`);
        }
        assert.match(codigo, /revisarPasajero/);
    }

    const cooperativas = leer('frontend/pages/cooperativa/cooperativas.html');
    for (const etiqueta of ['Nombre \\*', 'RUC \\*', 'Dirección \\*', 'Teléfono \\*', 'Correo \\*', 'Contraseña \\*']) {
        assert.match(cooperativas, new RegExp(`>${etiqueta}<`));
    }
    assert.doesNotMatch(leer('frontend/js/cooperativas.js'), /error\.message/);

    const rechazo = leer('frontend/pages/oficinista/validar-pagos.html');
    assert.match(rechazo, />Motivo del rechazo \*</);

    const buscar = leer('frontend/pages/cliente/buscar.html');
    for (const id of ['origen', 'destino', 'fecha']) assert.match(buscar, new RegExp(`id="${id}-error"`));

    for (const filtro of ['Origen', 'Destino', 'Fecha']) {
        assert.match(leer('frontend/pages/oficinista/vender.html'), new RegExp(`>${filtro} \\(opcional\\)<`));
    }
    for (const filtro of ['Desde', 'Hasta']) {
        assert.match(leer('frontend/pages/oficinista/historial.html'), new RegExp(`>${filtro} \\(opcional\\)<`));
    }

    // Misma nota en todos los formularios con campos obligatorios.
    for (const pagina of ['compra/pago', 'compra/resumen-compra', 'cooperativa/cooperativas', 'bus/grupos', 'bus/buses',
        'cliente/buscar', 'cooperativa/plantilla-asientos', 'frecuencias/gestor-frecuencias', 'frecuencias/hoja-ruta']) {
        assert.match(leer(`frontend/pages/${pagina}.html`), /\* Campo obligatorio/, pagina);
    }
});

test('ningún formulario muestra error.message de la base directamente', () => {
    const archivos = ['frontend/js/pago.js', 'frontend/js/resumen-compra.js', 'frontend/js/boleto.js',
        'frontend/js/historial.js', 'frontend/js/seleccionAsientos.js', 'frontend/js/contextoUsuario.js',
        'frontend/pages/administrador/vista-general.html', 'frontend/pages/cooperativa/reportes.html',
        'frontend/pages/oficinista/validar-pagos.js'];

    for (const archivo of archivos) {
        // Se puede leer error.message para clasificar el error, pero no mostrarlo.
        assert.doesNotMatch(leer(archivo),
            /mostrar\w*\([^;]*error\??\.message|'No se pudo completar la operación\. ' \+ msg/, archivo);
    }
});

test('historial del oficinista: los días de los filtros son de Ecuador', () => {
    const codigo = leer('frontend/pages/oficinista/historial.js');
    assert.match(codigo, /T00:00:00-05:00/);
    assert.doesNotMatch(codigo, /T00:00:00`\)/);
});

test('migración 3.2: reglas en la base, desde la versión de la nube', () => {
    const sql = leer('supabase/migrations/20261122090000_validaciones_formularios.sql');

    assert.match(sql, /^begin;/m);
    assert.match(sql, /^commit;/m);
    // Cooperativas: disparador con mensajes claros y restricciones de respaldo.
    assert.match(sql, /create trigger cooperativas_validar\s+before insert or update on public\.cooperativas/);
    for (const restriccion of ['cooperativas_nombre_largo_check', 'cooperativas_ruc_valido_check',
        'cooperativas_direccion_largo_check', 'cooperativas_telefono_valido_check']) {
        assert.match(sql, new RegExp(`add constraint ${restriccion}`));
    }
    // Los mensajes dicen el campo (cooperativas.js los ubica junto al campo).
    assert.match(sql, /'El RUC no es válido/);
    assert.match(sql, /'Escribe la dirección/);
    assert.match(sql, /'Escribe un teléfono/);
    // Pasajeros: dígito verificador y nombres; boletos con las mismas reglas.
    assert.match(sql, /if not public\.cedula_ecuatoriana_valida\(v_cedula\) then/);
    assert.doesNotMatch(sql, /v_cedula !~ '\^\[0-9\]\{10\}\$'/);
    assert.match(sql, /add constraint boletos_cedula_valida_check/);
    // Rechazo de 3 a 300 y comprobante en la carpeta de la compra y subido de verdad.
    assert.match(sql, /length\(v_motivo\) > 300/);
    assert.match(sql, /add constraint compras_motivo_rechazo_check/);
    assert.match(sql, /v_usuario::text \|\| '\/' \|\| p_compra_id::text \|\| '\/%'/);
    assert.match(sql, /\\.\(jpe\?g\|png\|webp\|pdf\)\$/);
    assert.match(sql, /from storage\.objects as o/);
});

test('las reglas de la pantalla y de la base son las mismas (RUC y teléfono)', async () => {
    const { rucValido, telefonoContactoValido } = await cooperativa();
    const sql = leer('supabase/migrations/20261122090000_validaciones_formularios.sql');

    assert.match(sql, /substr\(p_ruc, 3, 1\) in \('0', '1', '2', '3', '4', '5', '6', '9'\)/);
    assert.match(sql, /right\(p_ruc, 3\) <> '000'/);
    assert.match(sql, /'\^\(09\[0-9\]\{8\}\|0\[2-7\]\[0-9\]\{7\}\)\$'/);
    for (const digito of '0123456789') {
        assert.equal(rucValido(`17${digito}0012345001`), '01234569'.includes(digito), digito);
    }
    assert.equal(telefonoContactoValido('0812345678'), false);
});

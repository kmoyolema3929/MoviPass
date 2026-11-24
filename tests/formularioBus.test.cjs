// Ejecutar: node --test tests/formularioBus.test.cjs
// Registro de buses (cambio 6, parte 3): reglas del formulario sin base de datos.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const cargar = () => import('../frontend/js/formularioBus.js');

const marcasCarroceria = [{ id: 1, nombre: 'Marcopolo' }, { id: 10, nombre: 'Otro' }];
const marcasChasis = [{ id: 3, nombre: 'Hino' }, { id: 9, nombre: 'Otro' }];
const contexto = {
    buses: [{ id: 'b1', numero_interno: '15', placa: 'ABC-1234' }],
    marcasCarroceria,
    marcasChasis
};

const valido = {
    numeroInterno: ' 16 ',
    placa: 'xyz1234',
    dueno: '  Juan   Pérez ',
    grupoId: 'g1',
    plantillaId: 'p1',
    marcaCarroceriaId: '1',
    marcaCarroceriaOtra: '',
    marcaChasisId: '',
    marcaChasisOtra: '',
    chasis: '',
    usuarioBusId: ''
};

test('un bus con los campos obligatorios no tiene errores', async () => {
    const { revisarBus } = await cargar();
    assert.deepEqual(revisarBus(valido, contexto), {});
});

test('campos obligatorios vacíos', async () => {
    const { revisarBus } = await cargar();
    const errores = revisarBus({}, contexto);

    assert.deepEqual(Object.keys(errores).sort(),
        ['dueno', 'grupoId', 'marcaCarroceriaId', 'numeroInterno', 'placa', 'plantillaId']);
});

test('número interno: no se repite en la cooperativa (sin distinguir mayúsculas) y máximo 10', async () => {
    const { revisarBus } = await cargar();

    assert.match(revisarBus({ ...valido, numeroInterno: ' 15' }, contexto).numeroInterno, /Ya tienes un bus/);
    assert.match(revisarBus({ ...valido, numeroInterno: '12345678901' }, contexto).numeroInterno, /Máximo 10/);

    // Al editar, su propio número no cuenta como repetido.
    assert.equal(revisarBus({ ...valido, numeroInterno: '15', placa: 'ABC-1234' }, { ...contexto, idActual: 'b1' }).numeroInterno, undefined);
});

test('placa normalizada ABC-1234 y sin repetir', async () => {
    const { revisarBus } = await cargar();

    assert.match(revisarBus({ ...valido, placa: 'AB-12' }, contexto).placa, /Formato de placa no válido/);
    assert.match(revisarBus({ ...valido, placa: 'abc 1234' }, contexto).placa, /Ya existe un bus con esta placa/);
});

test('marca «Otro» exige escribir la marca (carrocería y chasis)', async () => {
    const { revisarBus } = await cargar();

    assert.match(revisarBus({ ...valido, marcaCarroceriaId: '10' }, contexto).marcaCarroceriaOtra, /Escribe la marca de carrocería/);
    assert.equal(revisarBus({ ...valido, marcaCarroceriaId: '10', marcaCarroceriaOtra: 'Carrocerías Pérez' }, contexto).marcaCarroceriaOtra, undefined);

    assert.match(revisarBus({ ...valido, marcaChasisId: '9' }, contexto).marcaChasisOtra, /Escribe la marca de chasis/);
    assert.equal(revisarBus({ ...valido, marcaChasisId: '3' }, contexto).marcaChasisOtra, undefined);
});

test('la opción «Crear nueva plantilla» no cuenta como plantilla elegida', async () => {
    const { revisarBus, CREAR_PLANTILLA } = await cargar();
    assert.match(revisarBus({ ...valido, plantillaId: CREAR_PLANTILLA }, contexto).plantillaId, /Elige la plantilla/);
});

test('datosDelBus: columnas de la base, textos limpios y opcionales en null', async () => {
    const { datosDelBus } = await cargar();

    assert.deepEqual(datosDelBus(valido, contexto), {
        numero_interno: '16',
        placa: 'XYZ-1234',
        dueno: 'Juan Pérez',
        grupo_id: 'g1',
        plantilla_id: 'p1',
        marca_carroceria_id: 1,
        marca_carroceria_otra: null,
        marca_chasis_id: null,
        marca_chasis_otra: null,
        chasis: null,
        usuario_bus_id: null
    });

    const conOtro = datosDelBus({
        ...valido, numeroInterno: '7a', marcaCarroceriaId: '10', marcaCarroceriaOtra: ' Pérez ',
        marcaChasisId: '3', marcaChasisOtra: 'ignorado', chasis: ' 9BM123 ', usuarioBusId: 'u1'
    }, contexto);

    assert.equal(conOtro.numero_interno, '7A');
    assert.equal(conOtro.marca_carroceria_otra, 'Pérez');
    assert.equal(conOtro.marca_chasis_id, 3);
    assert.equal(conOtro.marca_chasis_otra, null);
    assert.equal(conOtro.chasis, '9BM123');
    assert.equal(conOtro.usuario_bus_id, 'u1');
});

test('foto: solo JPG, PNG o WebP de hasta 2 MB', async () => {
    const { validarFoto } = await cargar();

    assert.equal(validarFoto(null), '');
    assert.equal(validarFoto({ type: 'image/jpeg', size: 2 * 1024 * 1024 }), '');
    assert.match(validarFoto({ type: 'image/png', size: 2 * 1024 * 1024 + 1 }), /más de 2 MB/);
    assert.match(validarFoto({ type: 'application/pdf', size: 100 }), /JPG, PNG o WebP/);
    assert.match(validarFoto({ type: 'image/gif', size: 100 }), /JPG, PNG o WebP/);
});

test('ruta de la foto: carpeta de la cooperativa (la exigen la base y Storage)', async () => {
    const { rutaFoto } = await cargar();

    assert.equal(rutaFoto('coop-1', 'bus-9', { type: 'image/webp' }, 1700000000000), 'coop-1/bus-9-1700000000000.webp');
    assert.equal(rutaFoto('coop-1', 'bus-9', { type: 'image/jpeg' }, 1), 'coop-1/bus-9-1.jpg');
});

test('mensajes de error de la base', async () => {
    const { mensajeErrorBus } = await cargar();
    const boletos = 'No se puede cambiar la distribución: 1 boleto vendido... Boletos afectados: 16/11/2026 · bus ABC-1234 · asiento 7.';

    assert.equal(mensajeErrorBus({ code: '23505', message: 'duplicate key', details: 'Key (cooperativa_id, lower(numero_interno::text))=(c, 15) already exists.' }),
        'Ya tienes un bus con ese número interno.');
    assert.equal(mensajeErrorBus({ code: '23505', details: 'Key (placa)=(ABC-1234) already exists.' }), 'Ya existe un bus con esta placa.');
    assert.equal(mensajeErrorBus({ code: '55006', message: boletos }), boletos);
    assert.equal(mensajeErrorBus({ code: '23502', message: 'Escribe la marca de carrocería.' }), 'Escribe la marca de carrocería.');
    assert.match(mensajeErrorBus({ code: '23503' }, 'eliminar'), /registros relacionados/);
    assert.equal(mensajeErrorBus({ code: '23503', message: 'El usuario bus elegido no pertenece a la cooperativa.' }),
        'El usuario bus elegido no pertenece a la cooperativa.');
});

test('el formulario marca obligatorios con * y opcionales con (opcional)', () => {
    const html = readFileSync(join(__dirname, '../frontend/pages/bus/buses.html'), 'utf8');

    for (const etiqueta of ['Número interno \\*', 'Placa \\*', 'Grupo \\*', 'Plantilla de asientos \\*',
        'Marca de carrocería \\*', 'Dueño o socio \\*']) {
        assert.match(html, new RegExp(`>${etiqueta}<`));
    }

    for (const etiqueta of ['Marca de chasis', 'Número de chasis', 'Usuario bus asignado', 'Foto']) {
        assert.match(html, new RegExp(`>${etiqueta} \\(opcional\\)<`));
    }
});

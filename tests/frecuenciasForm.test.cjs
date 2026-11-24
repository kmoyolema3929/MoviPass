// Ejecutar: node --test tests/frecuenciasForm.test.cjs
// Frecuencias aprobadas (cambio 7, parte 7.1): sin base de datos.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const cargar = () => import('../frontend/js/frecuenciasForm.js');
const lugares = () => import('../frontend/js/lugares.js');

const provincias = [{ id: 11, nombre: 'Loja' }, { id: 13, nombre: 'Manabí' }, { id: 16, nombre: 'Pastaza' }, { id: 18, nombre: 'Tungurahua' }];
const cantones = [
    { id: 1801, provincia_id: 18, nombre: 'Ambato', ciudad: null },
    { id: 1101, provincia_id: 11, nombre: 'Loja', ciudad: null },
    { id: 1601, provincia_id: 16, nombre: 'Pastaza', ciudad: 'Puyo' },
    // Etiquetas calculadas por la base: mismo nombre sin ciudad distinta -> con la provincia.
    { id: 1116, provincia_id: 11, nombre: 'Olmedo', ciudad: null, etiqueta: 'Olmedo (Loja)' },
    { id: 1318, provincia_id: 13, nombre: 'Olmedo', ciudad: null, etiqueta: 'Olmedo (Manabí)' }
];

const valida = {
    cooperativaId: 'c1', origenCantonId: '1801', destinoCantonId: '1101', hora: '19:00',
    precio: '12.5', resolucion: ' ANT-2024-0123 ', grupoId: 'g1', tipo: 'directa', activa: 'true'
};

test('cantón con su ciudad: «Pastaza (Puyo)»; igual nombre: «Ambato»', async () => {
    const { etiquetaCanton } = await lugares();

    assert.equal(etiquetaCanton(cantones[2]), 'Pastaza (Puyo)');
    assert.equal(etiquetaCanton(cantones[0]), 'Ambato');
    assert.equal(etiquetaCanton({ nombre: 'Quito', ciudad: 'quito' }), 'Quito');
    // La etiqueta de la base manda: dos «Olmedo» se distinguen por su provincia.
    assert.equal(etiquetaCanton(cantones[3]), 'Olmedo (Loja)');
    assert.equal(etiquetaCanton(cantones[4]), 'Olmedo (Manabí)');
});

test('texto comparable: sin tildes, mayúsculas ni espacios sobrantes', async () => {
    const { textoComparable } = await lugares();
    assert.equal(textoComparable('  Baños  de Agua SANTA '), 'banos de agua santa');
});

test('una frecuencia directa válida no tiene errores', async () => {
    const { revisarFrecuencia } = await cargar();
    assert.deepEqual(revisarFrecuencia(valida), {});
});

test('campos obligatorios y reglas', async () => {
    const { revisarFrecuencia } = await cargar();

    assert.deepEqual(Object.keys(revisarFrecuencia({})).sort(),
        ['cooperativaId', 'destinoCantonId', 'grupoId', 'hora', 'origenCantonId', 'precio', 'resolucion', 'tipo']);
    assert.match(revisarFrecuencia({ ...valida, destinoCantonId: '1801' }).destinoCantonId, /mismo cantón/);
    assert.match(revisarFrecuencia({ ...valida, precio: '-1' }).precio, /precio válido/);
    assert.equal(revisarFrecuencia({ ...valida, precio: '0' }).precio, undefined);
    assert.match(revisarFrecuencia({ ...valida, resolucion: 'x'.repeat(61) }).resolucion, /Máximo 60/);
});

test('con paradas: al menos una, con lugar y hora, sin repetir ni ser origen o destino', async () => {
    const { revisarFrecuencia } = await cargar();
    const conParadas = { ...valida, tipo: 'compartida' };

    assert.match(revisarFrecuencia(conParadas, []).paradasGeneral, /al menos una parada/);

    const errores = revisarFrecuencia(conParadas, [
        { canton_id: 1601, nombre: '', hora_estimada: '21:00' },
        { canton_id: null, nombre: 'Terminal Latacunga', hora_estimada: '' },
        { canton_id: 1601, nombre: '', hora_estimada: '22:00' },
        { canton_id: 1101, nombre: '', hora_estimada: '23:00' },
        { canton_id: null, nombre: 'x', hora_estimada: '23:30' }
    ]);

    assert.deepEqual(errores.paradas, [
        {},
        { hora: 'Escribe la hora estimada.' },
        { lugar: 'Parada repetida.' },
        { lugar: 'No puede ser el origen ni el destino.' },
        { lugar: 'Elige o escribe el lugar.' }
    ]);

    assert.equal(revisarFrecuencia(conParadas, [{ canton_id: null, nombre: 'Terminal Latacunga', hora_estimada: '21:30' }]).paradas, undefined);
});

test('paradas: se eligen de la lista o se escriben', async () => {
    const { opcionesParada, resolverParada } = await cargar();
    const opciones = opcionesParada(cantones);

    assert.deepEqual(opciones.map(o => o.texto), ['Ambato', 'Loja', 'Olmedo (Loja)', 'Olmedo (Manabí)', 'Pastaza (Puyo)']);
    // Por la etiqueta (sin tildes ni mayúsculas) o por el nombre si solo hay un cantón así.
    assert.deepEqual(resolverParada('pastaza (puyo)', opciones), { canton_id: 1601, nombre: '' });
    assert.deepEqual(resolverParada('Pastaza', opciones), { canton_id: 1601, nombre: '' });
    // Dos cantones «Olmedo»: sin la provincia no se sabe cuál; con la provincia, sí.
    assert.deepEqual(resolverParada('Olmedo', opciones), { canton_id: null, nombre: 'Olmedo' });
    assert.deepEqual(resolverParada('Olmedo (Manabí)', opciones), { canton_id: 1318, nombre: '' });
    // Un lugar que no está en la lista se escribe.
    assert.deepEqual(resolverParada('  Terminal   Latacunga ', opciones), { canton_id: null, nombre: 'Terminal Latacunga' });
});

test('datos para guardar_frecuencia', async () => {
    const { datosFrecuencia } = await cargar();

    assert.deepEqual(datosFrecuencia({ ...valida, precio: '12.499', hora: '19:00:00', activa: 'false' }), {
        origen_canton_id: 1801,
        destino_canton_id: 1101,
        hora: '19:00',
        precio_base: 12.5,
        numero_resolucion: 'ANT-2024-0123',
        grupo_id: 'g1',
        activa: false,
        tipo: 'directa'
    });
});

test('frecuencias migradas por corregir', async () => {
    const { porCorregir } = await cargar();

    assert.deepEqual(porCorregir({ origen_canton_id: 1801, destino_canton_id: null, grupo_id: null }), ['cantón de destino', 'grupo de bus']);
    assert.deepEqual(porCorregir({ origen_canton_id: 1801, destino_canton_id: 1101, grupo_id: 'g1' }), []);
});

test('orden en la hoja de ruta: primero el orden elegido, luego por hora', async () => {
    const { ordenarParaHojaRuta } = await cargar();
    const lista = [
        { id: 1, hora: '10:00:00', orden_hoja_ruta: null },
        { id: 2, hora: '19:00:00', orden_hoja_ruta: 1 },
        { id: 3, hora: '20:00:00', orden_hoja_ruta: 2 },
        { id: 4, hora: '08:00:00', orden_hoja_ruta: null }
    ];

    assert.deepEqual(ordenarParaHojaRuta(lista).map(f => f.id), [2, 3, 4, 1]);
});

test('subir y bajar dentro del grupo (la vuelta justo debajo de su ida)', async () => {
    const { moverFrecuencia } = await cargar();
    const lista = [
        { id: 1, grupo_id: 'g1', hora: '10:00', orden_hoja_ruta: null }, // Ambato → Guayaquil
        { id: 2, grupo_id: 'g1', hora: '11:00', orden_hoja_ruta: null }, // Guayaquil → Ambato
        { id: 3, grupo_id: 'g1', hora: '19:00', orden_hoja_ruta: null }, // Ambato → Loja
        { id: 4, grupo_id: 'g1', hora: '20:00', orden_hoja_ruta: null }, // Loja → Ambato
        { id: 5, grupo_id: 'g2', hora: '05:00', orden_hoja_ruta: null }
    ];

    assert.deepEqual(moverFrecuencia(lista, 3, -1), [1, 3, 2, 4]);
    assert.equal(moverFrecuencia(lista, 1, -1), null);
    assert.equal(moverFrecuencia(lista, 4, 1), null);
    assert.equal(moverFrecuencia([{ id: 9, grupo_id: null }], 9, 1), null);
});

test('la pantalla marca obligatorios con * y ya no enlaza a la de paradas', () => {
    const html = readFileSync(join(__dirname, '../frontend/pages/frecuencias/gestor-frecuencias.html'), 'utf8');

    for (const etiqueta of ['Provincia de origen', 'Cantón de origen', 'Provincia de destino', 'Cantón de destino',
        'Hora de salida', 'Precio base \\(USD\\)', 'N\\.º de resolución de la ANT', 'Grupo de bus', 'Estado', 'Tipo']) {
        assert.match(html, new RegExp(`>${etiqueta} \\*<`));
    }

    assert.match(html, /Con paradas/);
    assert.doesNotMatch(html, /gestor-paradas\.html/);
});

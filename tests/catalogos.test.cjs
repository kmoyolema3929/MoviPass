// Ejecutar: node --test tests/catalogos.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const codigo = readFileSync(join(__dirname, '../frontend/js/catalogos.js'), 'utf8')
    .replace(/^import .*;\r?\n/m, '')
    .replace(/^export /gm, '');

// Supabase falso: registra la consulta y devuelve las filas indicadas.
function cargar({ data = [], error = null } = {}) {
    const llamadas = [];
    const consulta = {
        select(columnas) { llamadas.push(['select', columnas]); return this; },
        eq(columna, valor) { llamadas.push(['eq', columna, valor]); return this; },
        order(columna) {
            llamadas.push(['order', columna]);
            return Promise.resolve({ data, error });
        },
    };
    const supabase = {
        from(tabla) { llamadas.push(['from', tabla]); return consulta; },
    };
    const contexto = vm.createContext({ supabase });
    vm.runInContext(codigo, contexto);
    return { modulo: contexto, llamadas };
}

// Los objetos vienen de otro contexto de vm: se copian para compararlos.
const copia = valor => JSON.parse(JSON.stringify(valor));

const casos = [
    ['obtenerProvincias', 'provincias', 'id, nombre'],
    ['obtenerMarcasCarroceria', 'marcas_carroceria', 'id, nombre'],
    ['obtenerMarcasChasis', 'marcas_chasis', 'id, nombre'],
    ['obtenerTiposPasajero', 'tipos_pasajero', 'codigo, nombre, descuento'],
    ['obtenerCantones', 'cantones', 'id, provincia_id, nombre'],
];

for (const [funcion, tabla, columnas] of casos) {
    test(`${funcion} lee ${tabla} activos ordenados por nombre`, async () => {
        const { modulo, llamadas } = cargar();

        await modulo[funcion]();

        assert.deepEqual(copia(llamadas), [
            ['from', tabla],
            ['select', columnas],
            ['eq', 'activo', true],
            ['order', 'nombre'],
        ]);
    });
}

test('obtenerCantones filtra por provincia', async () => {
    const { modulo, llamadas } = cargar();

    await modulo.obtenerCantones('13');

    assert.deepEqual(copia(llamadas), [
        ['from', 'cantones'],
        ['select', 'id, provincia_id, nombre'],
        ['eq', 'activo', true],
        ['eq', 'provincia_id', 13],
        ['order', 'nombre'],
    ]);
});

test('ordena en español (tildes) y deja "Otro" al final', async () => {
    const { modulo } = cargar({
        data: [
            { id: 1, nombre: 'Otro' },
            { id: 2, nombre: 'Varma' },
            { id: 3, nombre: 'Olímpica' },
            { id: 4, nombre: 'Busscar' },
            { id: 5, nombre: 'Picosa' },
        ],
    });

    const marcas = await modulo.obtenerMarcasCarroceria();

    assert.deepEqual(copia(marcas).map(m => m.nombre),
        ['Busscar', 'Olímpica', 'Picosa', 'Varma', 'Otro']);
});

test('devuelve una lista vacía si no hay datos', async () => {
    const { modulo } = cargar({ data: null });

    assert.deepEqual(copia(await modulo.obtenerProvincias()), []);
});

test('lanza el error de Supabase', async () => {
    const error = new Error('sin conexión');
    const { modulo } = cargar({ error });

    await assert.rejects(modulo.obtenerMarcasChasis(), /sin conexión/);
});

// Ejecutar: node --test tests/celdasEspeciales.test.cjs
// Baño en la plantilla de asientos: posiciones, numeración y validación (sin base de datos).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const cargar = () => import('../frontend/js/celdasEspeciales.js');

const bano = (fila, columna) => ({ fila, columna, tipo: 'bano' });

// Cómo se numeraban los asientos antes del baño (crearPisos / guardar_plantilla_bus).
function numeracionAnterior(pisos) {
    let siguiente = 1;

    return pisos.map((piso, indicePiso) => Array.from({ length: piso.cantidad }, (_, i) => {
        const enFilaDeCinco = piso.ultima_fila_5 && i >= (piso.filas - 1) * 4;

        return {
            numero: siguiente++,
            piso: indicePiso + 1,
            fila: enFilaDeCinco ? piso.filas : Math.floor(i / piso.columnas) + 1,
            columna: enFilaDeCinco ? i - (piso.filas - 1) * 4 + 1 : (i % piso.columnas) + 1,
            tipo: pisos.length === 2 && indicePiso === 0 ? 'vip' : 'normal'
        };
    }));
}

const sinBano = [
    [{ cantidad: 41, filas: 10, columnas: 4, ultima_fila_5: true }],
    [{ cantidad: 7, filas: 3, columnas: 3, ultima_fila_5: false }],
    [
        { cantidad: 21, filas: 5, columnas: 4, ultima_fila_5: true },
        { cantidad: 20, filas: 5, columnas: 4, ultima_fila_5: false }
    ]
];

for (const pisos of sinBano) {
    test(`las plantillas sin baño se numeran igual que antes (${pisos.map(p => p.cantidad).join(' + ')})`, async () => {
        const { generarAsientos } = await cargar();

        assert.deepEqual(generarAsientos(pisos), numeracionAnterior(pisos));
    });
}

test('el baño en la última fila no es asiento y baja la capacidad (41 -> 39)', async () => {
    const { generarAsientos } = await cargar();

    const [asientos] = generarAsientos([{
        cantidad: 41, filas: 10, columnas: 4, ultima_fila_5: true,
        celdas_especiales: [bano(10, 4), bano(10, 5)]
    }]);

    assert.equal(asientos.length, 39);
    assert.deepEqual(asientos.map(a => a.numero), Array.from({ length: 39 }, (_, i) => i + 1));
    assert.ok(!asientos.some(a => a.fila === 10 && a.columna >= 4));
});

test('un baño en medio corre la numeración de los asientos siguientes', async () => {
    const { generarAsientos } = await cargar();

    const [asientos] = generarAsientos([{
        cantidad: 8, filas: 2, columnas: 4, ultima_fila_5: false,
        celdas_especiales: [bano(1, 1)]
    }]);

    assert.deepEqual(asientos[0], { numero: 1, piso: 1, fila: 1, columna: 2, tipo: 'normal' });
    assert.equal(asientos.length, 7);
});

test('en dos pisos la numeración sigue en el piso 2 y el piso 1 es VIP', async () => {
    const { generarAsientos } = await cargar();

    const [piso1, piso2] = generarAsientos([
        { cantidad: 21, filas: 5, columnas: 4, ultima_fila_5: true, celdas_especiales: [bano(5, 5)] },
        { cantidad: 20, filas: 5, columnas: 4, ultima_fila_5: false }
    ]);

    assert.equal(piso1.length, 20);
    assert.ok(piso1.every(a => a.tipo === 'vip'));
    assert.equal(piso2[0].numero, 21);
    assert.equal(piso2[0].tipo, 'normal');
});

const validaciones = [
    ['baño válido en la última fila', [bano(10, 4)], ''],
    ['sin baño', [], ''],
    ['fila fuera de la cuadrícula', [bano(11, 1)], /fuera de la distribución/],
    ['columna 5 sin última fila de 5', [bano(1, 5)], /fuera de la distribución/],
    ['celda repetida', [bano(10, 4), bano(10, 4)], /repetida/],
    ['tipo que no existe', [{ fila: 10, columna: 4, tipo: 'jacuzzi' }], /tipo no válido/],
];

for (const [nombre, celdas, esperado] of validaciones) {
    test(`validarCeldasEspeciales: ${nombre}`, async () => {
        const { validarCeldasEspeciales } = await cargar();
        const piso = { cantidad: 40, filas: 10, columnas: 4, ultima_fila_5: false, celdas_especiales: celdas };
        const resultado = validarCeldasEspeciales(piso, 1);

        if (esperado === '') assert.equal(resultado, '');
        else assert.match(resultado, esperado);
    });
}

test('validarCeldasEspeciales: una fila incompleta no tiene celdas al final', async () => {
    const { validarCeldasEspeciales } = await cargar();

    // 7 asientos en 3 columnas: la fila 3 solo tiene la columna 1.
    const piso = { cantidad: 7, filas: 3, columnas: 3, ultima_fila_5: false, celdas_especiales: [bano(3, 2)] };

    assert.match(validarCeldasEspeciales(piso, 1), /fuera de la distribución/);
});

test('validarCeldasEspeciales: el piso debe conservar al menos un asiento', async () => {
    const { validarCeldasEspeciales } = await cargar();

    const piso = { cantidad: 2, filas: 1, columnas: 2, ultima_fila_5: false, celdas_especiales: [bano(1, 1), bano(1, 2)] };

    assert.match(validarCeldasEspeciales(piso, 2), /piso 2 debe tener al menos un asiento/);
});

test('especialesPorPiso: lee el baño guardado e ignora datos antiguos o inválidos', async () => {
    const { especialesPorPiso } = await cargar();

    const distribucion = [
        { cantidad: 41, filas: 10, columnas: 4, ultima_fila_5: true },
        { cantidad: 20, filas: 5, columnas: 4, celdas_especiales: [bano(5, 4), { fila: 'x', columna: 1, tipo: 'bano' }] }
    ];

    assert.deepEqual([...especialesPorPiso(distribucion)], [[2, [bano(5, 4)]]]);
    assert.equal(especialesPorPiso(null).size, 0);
});

// Cambio 6: el editor visual reemplazó la pregunta «¿Este bus tiene baño?»;
// el baño ahora es una herramienta más (ver tests/editorPlantilla.test.cjs).
test('los mapas de venta leen también puerta, escalera, cabina y pasillo', async () => {
    const { especialesPorPiso } = await cargar();
    const celdas = ['puerta', 'escalera', 'cabina', 'pasillo'].map((tipo, i) => ({ fila: 1, columna: i + 1, tipo }));

    assert.deepEqual([...especialesPorPiso([{ formato: 2, celdas_especiales: celdas }])], [[1, celdas]]);
});

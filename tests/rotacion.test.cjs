// Ejecutar: node --test tests/rotacion.test.cjs
// Rotación cíclica de la hoja de ruta (cambio 7, parte 7.2).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const cargar = () => import('../frontend/js/rotacion.js');

const bus = n => ({ id: `b${n}`, numero_interno: String(n) });
const seis = [40, 41, 42, 43, 44, 45].map(bus);
const frecuencias = ['Ambato → Loja 19:00', 'Loja → Ambato 20:00', 'Ambato → Guayaquil 10:00', 'Guayaquil → Ambato 11:00'];

// La tabla del diseño de MoviPass: filas = 4 frecuencias, descanso y retén; columnas = días.
const EJEMPLO = [
    [40, 45, 44, 43, 42, 41],
    [41, 40, 45, 44, 43, 42],
    [42, 41, 40, 45, 44, 43],
    [43, 42, 41, 40, 45, 44],
    [44, 43, 42, 41, 40, 45], // Parada 1 (descanso)
    [45, 44, 43, 42, 41, 40]  // Parada 2 (retén)
];

const numeros = orden => orden.map(id => Number(id.slice(1)));
const comoTabla = dias => dias[0].map((_, fila) => dias.map(dia => Number(dia[fila].slice(1))));

test('6 buses y 4 frecuencias: exactamente la tabla del diseño', async () => {
    const { generarDias } = await cargar();
    assert.deepEqual(comoTabla(generarDias({ buses: seis, frecuencias, dias: 6 })), EJEMPLO);
});

test('el séptimo día vuelve al primero (ciclo de 6)', async () => {
    const { generarDias } = await cargar();
    const dias = generarDias({ buses: seis, frecuencias, dias: 7 });
    assert.deepEqual(dias[6], dias[0]);
});

test('cada día cada bus baja una fila y el del retén sube a la primera frecuencia', async () => {
    const { generarDias } = await cargar();
    const dias = generarDias({ buses: seis, frecuencias, dias: 10 });

    for (let d = 1; d < dias.length; d++) {
        dias[d - 1].forEach((id, fila) => {
            assert.equal(dias[d].indexOf(id), (fila + 1) % 6);
        });
    }
});

test('sin huecos: cada día todas las frecuencias tienen bus y ningún bus repite', async () => {
    const { generarDias, repartirDia } = await cargar();

    generarDias({ buses: seis, frecuencias, dias: 14 }).forEach(orden => {
        const dia = repartirDia(orden, frecuencias);
        assert.equal(new Set(orden).size, 6);
        frecuencias.forEach(f => assert.ok(dia.frecuencias.get(f)));
        assert.equal(dia.descanso.length, 1);
        assert.ok(dia.reten);
    });
});

test('la rotación continúa desde el último día generado, no empieza de nuevo', async () => {
    const { generarDias } = await cargar();
    const primeros = generarDias({ buses: seis, frecuencias, dias: 3 });
    const siguientes = generarDias({ buses: seis, frecuencias, dias: 3, ordenAnterior: primeros[2] });

    assert.deepEqual(comoTabla([...primeros, ...siguientes]), EJEMPLO);
});

test('si entre el último día generado y el nuevo hay días sin generar, sigue la diagonal del calendario', async () => {
    const { generarDias } = await cargar();
    const dia1 = generarDias({ buses: seis, frecuencias, dias: 1 })[0];
    // Día 1 generado; se genera desde el día 4 (2 días sin generar en medio).
    const desdeDia4 = generarDias({ buses: seis, frecuencias, dias: 3, ordenAnterior: dia1, diasDesdeAnterior: 3 });

    assert.deepEqual(numeros(desdeDia4[0]), EJEMPLO.map(fila => fila[3]));
    assert.deepEqual(numeros(desdeDia4[2]), EJEMPLO.map(fila => fila[5]));
});

test('flota mínima: frecuencias + 2', async () => {
    const { busesQueFaltan, generarDias, textoFlota } = await cargar();

    assert.equal(busesQueFaltan(3, 5), 0);
    assert.equal(busesQueFaltan(3, 4), 1);
    assert.equal(busesQueFaltan(4, 1), 5);
    assert.throws(() => generarDias({ buses: [bus(1)], frecuencias, dias: 1 }), /Faltan 5 buses/);
    assert.throws(() => generarDias({ buses: seis, frecuencias: [], dias: 1 }), /no tiene frecuencias activas/);
    assert.match(textoFlota(4, 1), /se necesitan al menos 6 .* Faltan 5 buses\./);
    assert.doesNotMatch(textoFlota(4, 6), /Faltan/);
});

test('con más buses que frecuencias + 2: varios descansan y uno queda de retén', async () => {
    const { generarDias, repartirDia } = await cargar();
    const ocho = [40, 41, 42, 43, 44, 45, 46, 47].map(bus);
    const dias = generarDias({ buses: ocho, frecuencias, dias: 8 });
    const dia1 = repartirDia(dias[0], frecuencias);

    assert.deepEqual(dia1.descanso.map(id => Number(id.slice(1))), [44, 45, 46]);
    assert.equal(dia1.reten, 'b47');
    // Cada bus pasa por todas las filas en 8 días.
    ocho.forEach(b => assert.equal(new Set(dias.map(o => o.indexOf(b.id))).size, 8));
});

test('orden inicial por número interno numérico (9 antes que 10)', async () => {
    const { ordenInicial } = await cargar();
    assert.deepEqual(ordenInicial([bus(10), bus(9), { id: 'x', numero_interno: '2A' }]), ['x', 'b9', 'b10']);
});

test('si cambian los buses del grupo: los que salen se quitan y los nuevos entran al final', async () => {
    const { continuarOrden, rotar } = await cargar();
    const anterior = ['b42', 'b41', 'b40', 'b45', 'b44', 'b43'];
    const ahora = [40, 41, 43, 44, 45, 46, 47].map(bus); // salió el 42; entraron 46 y 47

    assert.deepEqual(continuarOrden(anterior, ahora), ['b41', 'b40', 'b45', 'b44', 'b43', 'b46', 'b47']);
    assert.deepEqual(rotar(['a', 'b', 'c'], 1), ['c', 'a', 'b']);
    assert.deepEqual(rotar(['a', 'b', 'c'], 4), ['c', 'a', 'b']);
});

test('tabla de la pantalla: frecuencias en orden, paradas y días sin generar', async () => {
    const { armarTablaHojaRuta } = await cargar();
    const frecs = [
        { id: 1, origen: 'Ambato', destino: 'Loja', hora: '19:00:00', activa: true },
        { id: 2, origen: 'Loja', destino: 'Ambato', hora: '20:00:00', activa: true },
        { id: 3, origen: 'Ambato', destino: 'Quito', hora: '06:00:00', activa: false }
    ];
    const turnos = [
        { fecha: '2026-11-16', tipo: 'frecuencia', frecuencia_id: 1, hoja_ruta_id: 10, bus_id: 'b40', numero_interno: '40', boletos: 2 },
        { fecha: '2026-11-16', tipo: 'frecuencia', frecuencia_id: 2, hoja_ruta_id: 11, bus_id: 'b41', numero_interno: '41', boletos: 0 },
        { fecha: '2026-11-16', tipo: 'descanso', posicion: 2, bus_id: 'b43', numero_interno: '43', boletos: 0 },
        { fecha: '2026-11-16', tipo: 'descanso', posicion: 1, bus_id: 'b42', numero_interno: '42', boletos: 0 },
        { fecha: '2026-11-16', tipo: 'reten', posicion: 1, bus_id: 'b44', numero_interno: '44', boletos: 0 }
    ];

    const { filas, columnas } = armarTablaHojaRuta({ frecuencias: frecs, turnos, fechas: ['2026-11-16', '2026-11-17'] });

    // La inactiva sin turnos no aparece.
    assert.deepEqual(filas.map(f => f.etiqueta),
        ['Ambato → Loja 19:00', 'Loja → Ambato 20:00', 'Parada 1 (descanso)', 'Parada 2 (retén)']);
    assert.deepEqual(filas[0].celdas[0], { fecha: '2026-11-16', buses: [{ id: 'b40', numero_interno: '40', placa: undefined }], hoja_ruta_id: 10, boletos: 2 });
    assert.deepEqual(filas[2].celdas[0].buses.map(b => b.numero_interno), ['42', '43']);
    assert.deepEqual(filas[0].celdas[1].buses, []);
    assert.deepEqual(columnas, [
        { fecha: '2026-11-16', generado: true, boletos: 2 },
        { fecha: '2026-11-17', generado: false, boletos: 0 }
    ]);
});

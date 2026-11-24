// Ejecutar: node --test tests/editorPlantilla.test.cjs
// Editor visual de plantillas (cambio 6, parte 2): modelo, numeración,
// conversión de plantillas antiguas y validación (sin base de datos).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const cargar = () => import('../frontend/js/editorPlantilla.js');
const especiales = () => import('../frontend/js/celdasEspeciales.js');

// Asientos de un modelo como texto por fila: "1 2 · 3 4" (· = pasillo, B = baño,
// _ = espacio vacío, x5 = asiento 5 bloqueado...).
function dibujo(modelo, piso = 0) {
    const letra = { pasillo: '·', bano: 'B', puerta: 'P', escalera: 'E', cabina: 'C', vacio: '_' };
    return modelo.pisos[piso].celdas.map(fila =>
        fila.map(c => (c.tipo === 'asiento' ? `${c.clase === 'bloqueado' ? 'x' : ''}${c.numero}` : letra[c.tipo])).join(' '));
}

test('plantilla nueva: 10 filas de 2 + pasillo + 2, numeradas en orden', async () => {
    const { crearModeloNuevo, resumir, validarModelo } = await cargar();
    const modelo = crearModeloNuevo(1);

    assert.deepEqual(dibujo(modelo).slice(0, 2), ['1 2 · 3 4', '5 6 · 7 8']);
    assert.equal(resumir(modelo).total, 40);
    assert.deepEqual(validarModelo(modelo), []);
});

test('dos pisos nuevos: abajo VIP y en total entre 40 y 60', async () => {
    const { crearModeloNuevo, resumir, validarModelo } = await cargar();
    const modelo = crearModeloNuevo(2);
    const r = resumir(modelo);

    assert.deepEqual(r.porPiso, [20, 40]);
    assert.equal(r.porTipo.vip, 20);
    assert.deepEqual(validarModelo(modelo), []);
});

test('primera fila con un solo asiento y baño en la última fila', async () => {
    const { crearModeloNuevo, cambiarCelda, quitarFila, resumir } = await cargar();
    let m = crearModeloNuevo(1);

    m = cambiarCelda(m, 0, 0, 0, 'cabina');
    m = cambiarCelda(m, 0, 0, 1, 'pasillo');
    m = cambiarCelda(m, 0, 0, 3, 'puerta');
    m = cambiarCelda(m, 0, 9, 4, 'bano');
    m = quitarFila(m, 0, 5);

    const filas = dibujo(m);
    assert.equal(filas[0], 'C · · P 1');
    assert.equal(filas[1], '2 3 · 4 5');
    assert.equal(filas.at(-1), '30 31 · 32 B');
    assert.equal(resumir(m).total, 32);
});

test('agregar filas y columnas en cualquier lugar; el pasillo sigue siendo pasillo', async () => {
    const { crearModeloNuevo, insertarFila, insertarColumna, quitarColumna } = await cargar();
    let m = crearModeloNuevo(1);

    m = insertarFila(m, 0, 0);
    assert.equal(dibujo(m)[0], '1 2 · 3 4');
    assert.equal(m.pisos[0].celdas.length, 11);

    m = insertarColumna(m, 0, 5);
    assert.equal(dibujo(m)[0], '1 2 · 3 4 5');

    m = quitarColumna(m, 0, 0);
    assert.equal(dibujo(m)[0], '1 · 2 3 4');
});

test('límites: máximo 20 filas y 8 columnas; mínimo 1', async () => {
    const { crearModeloNuevo, insertarFila, insertarColumna, quitarFila, quitarColumna, LIMITES } = await cargar();
    let m = crearModeloNuevo(1);

    for (let i = 0; i < 30; i++) m = insertarFila(m, 0, 0);
    for (let i = 0; i < 10; i++) m = insertarColumna(m, 0, 0);
    assert.equal(m.pisos[0].celdas.length, LIMITES.filas);
    assert.equal(m.pisos[0].celdas[0].length, LIMITES.columnas);

    for (let i = 0; i < 30; i++) m = quitarFila(m, 0, 0);
    for (let i = 0; i < 10; i++) m = quitarColumna(m, 0, 0);
    assert.equal(m.pisos[0].celdas.length, 1);
    assert.equal(m.pisos[0].celdas[0].length, 1);
});

test('numeración editable: el número queda fijo y no se repite', async () => {
    const { crearModeloNuevo, cambiarNumero, insertarFila, renumerarTodo } = await cargar();
    let m = crearModeloNuevo(1);

    const repetido = cambiarNumero(m, 0, 0, 0, '5');
    assert.match(repetido.error, /El número 5 ya lo tiene otro asiento \(fila 2\)/);
    assert.equal(repetido.modelo, m);

    assert.match(cambiarNumero(m, 0, 0, 0, '61').error, /del 1 al 60/);
    assert.match(cambiarNumero(m, 0, 0, 0, '2.5').error, /del 1 al 60/);
    assert.match(cambiarNumero(m, 0, 0, 2, '9').error, /no es un asiento/);

    // El asiento 40 pasa a ser el 50: los demás se quedan como estaban.
    m = cambiarNumero(m, 0, 9, 4, '50').modelo;
    assert.equal(dibujo(m).at(-1), '37 38 · 39 50');

    // En una plantilla nueva, una fila arriba renumera en orden; el 50 (fijo) no cambia.
    m = insertarFila(m, 0, 0);
    assert.equal(dibujo(m)[0], '1 2 · 3 4');
    assert.equal(dibujo(m).at(-1), '41 42 · 43 50');

    m = renumerarTodo(m);
    assert.equal(dibujo(m).at(-1), '41 42 · 43 44');
});

test('una plantilla guardada conserva sus números al agregar asientos', async () => {
    const { crearModeloNuevo, aDistribucion, desdeDistribucion, insertarFila } = await cargar();
    const guardada = aDistribucion(crearModeloNuevo(1));

    const m = insertarFila(desdeDistribucion(guardada), 0, 0);

    assert.equal(dibujo(m)[1], '1 2 · 3 4');
    assert.equal(dibujo(m)[0], '41 42 · 43 44');
});

test('VIP y cama cambian el tipo sin cambiar el número', async () => {
    const { crearModeloNuevo, cambiarCelda, resumir, aDistribucion } = await cargar();
    let m = crearModeloNuevo(1);

    m = cambiarCelda(m, 0, 0, 0, 'vip');
    m = cambiarCelda(m, 0, 0, 1, 'cama');

    assert.deepEqual(dibujo(m)[0], '1 2 · 3 4');
    assert.deepEqual(resumir(m).porTipo, { normal: 38, vip: 1, cama: 1, bloqueado: 0 });
    assert.deepEqual(aDistribucion(m)[0].asientos.slice(0, 2), [
        { fila: 1, columna: 1, numero: 1, tipo: 'vip' },
        { fila: 1, columna: 2, numero: 2, tipo: 'cama' }
    ]);
});

test('aDistribucion: formato 2 con toda la cuadrícula y capacidad = cantidad - celdas especiales', async () => {
    const { crearModeloNuevo, aDistribucion, desdeDistribucion } = await cargar();
    const distribucion = aDistribucion(crearModeloNuevo(2));

    distribucion.forEach((piso, i) => {
        assert.equal(piso.numero, i + 1);
        assert.equal(piso.formato, 2);
        assert.equal(piso.cantidad, piso.filas * piso.columnas);
        assert.equal(piso.asientos.length + piso.celdas_especiales.length, piso.cantidad);
    });

    // Ida y vuelta sin cambios.
    assert.deepEqual(aDistribucion(desdeDistribucion(distribucion)), distribucion);
});

test('plantilla antigua con baño y fila de 5: se ve igual y conserva todos los números', async () => {
    const { desdeDistribucion, convertirDistribucionAntigua } = await cargar();
    const { generarAsientos } = await especiales();

    const antigua = [{
        cantidad: 41, filas: 10, columnas: 4, ultima_fila_5: true,
        celdas_especiales: [{ fila: 10, columna: 5, tipo: 'bano' }]
    }];
    const m = desdeDistribucion(antigua);

    assert.equal(dibujo(m)[0], '1 2 · 3 4');
    assert.equal(dibujo(m)[9], '37 38 39 40 B');

    // Mismos números, pisos, filas y tipos que la numeración del cambio 11.
    const antes = generarAsientos(antigua).flat().map(({ numero, piso, fila, tipo }) => ({ numero, piso, fila, tipo }));
    const despues = convertirDistribucionAntigua(antigua).flatMap((piso, i) =>
        piso.asientos.map(({ numero, fila, tipo }) => ({ numero, piso: i + 1, fila, tipo })));
    assert.deepEqual(despues, antes);
});

test('plantilla antigua de dos pisos y de 3 columnas con fila incompleta', async () => {
    const { desdeDistribucion } = await cargar();

    const dosPisos = desdeDistribucion([
        { cantidad: 20, filas: 5, columnas: 4 },
        { cantidad: 24, filas: 6, columnas: 4, celdas_especiales: [{ fila: 6, columna: 3, tipo: 'bano' }] }
    ]);
    assert.equal(dibujo(dosPisos, 0)[0], '1 2 · 3 4');
    assert.equal(dosPisos.pisos[0].celdas[0][0].clase, 'vip');
    assert.equal(dibujo(dosPisos, 1)[5], '41 42 · B 43');

    const tres = desdeDistribucion([{ cantidad: 7, filas: 3, columnas: 3 }]);
    assert.deepEqual(dibujo(tres), ['1 2 3', '4 5 6', '7 · ·']);
});

test('validación: mismas reglas que la base', async () => {
    const { crearModeloNuevo, cambiarCelda, insertarFila, validarModelo, cambiarNumeroPisos } = await cargar();

    // Más de 60 asientos.
    let m = crearModeloNuevo(1);
    for (let i = 0; i < 6; i++) m = insertarFila(m, 0, 0);
    assert.match(validarModelo(m).join(' '), /Hay 64 asientos a la venta: el máximo es 60/);

    // Piso sin asientos.
    let solo = crearModeloNuevo(1);
    solo.pisos[0].celdas = [[{ tipo: 'asiento', clase: 'normal', numero: 1, fijo: true }]];
    solo = cambiarCelda(solo, 0, 0, 0, 'bano');
    assert.match(validarModelo(solo).join(' '), /debe tener al menos un asiento/);

    // Dos pisos con menos de 40.
    let dos = cambiarNumeroPisos(crearModeloNuevo(1), 2);
    assert.deepEqual(validarModelo(dos), []);
    dos.pisos[0].celdas = dos.pisos[0].celdas.slice(0, 2);
    assert.match(validarModelo(dos).join(' '), /entre 40 y 60 asientos a la venta \(tiene 28\)/);

    // Números repetidos (por ejemplo, datos editados a mano).
    const repetido = crearModeloNuevo(1);
    repetido.pisos[0].celdas[0][1].numero = 1;
    assert.match(validarModelo(repetido).join(' '), /El número de asiento 1 está repetido/);
});

test('pasar de 2 pisos a 1 y de 1 a 2', async () => {
    const { crearModeloNuevo, cambiarNumeroPisos, resumir } = await cargar();
    const dos = cambiarNumeroPisos(crearModeloNuevo(1), 2);

    assert.equal(dos.pisos.length, 2);
    assert.deepEqual(dibujo(dos, 1)[0], '41 42 · 43 44');
    assert.deepEqual(resumir(cambiarNumeroPisos(dos, 1)).porPiso, [40]);
});

test('herramientas: cuatro tipos de asiento y seis celdas especiales', async () => {
    const { HERRAMIENTAS } = await cargar();
    assert.deepEqual(HERRAMIENTAS.map(h => h.clave),
        ['normal', 'vip', 'cama', 'bloqueado', 'bano', 'puerta', 'escalera', 'cabina', 'pasillo', 'vacio']);
});

test('la pantalla «Mis plantillas» marca los campos obligatorios', () => {
    const html = readFileSync(join(__dirname, '../frontend/pages/cooperativa/plantilla-asientos.html'), 'utf8');

    assert.match(html, /Nombre de la plantilla \*/);
    assert.match(html, /Número de pisos \*/);
    assert.match(html, /<script type="module" src="\.\.\/\.\.\/js\/plantillas\.js"><\/script>/);
});

test('mapas de venta: la columna de solo pasillo es angosta y la cama tiene su clase', async () => {
    const { columnasDelMapa, claseTipoAsiento } = await especiales();
    const { convertirDistribucionAntigua } = await cargar();

    const [piso] = convertirDistribucionAntigua([{ cantidad: 41, filas: 10, columnas: 4, ultima_fila_5: true }]);
    const filas = Array.from({ length: 10 }, (_, i) => i + 1);

    // La última fila de 5 ocupa el pasillo: esa columna ya no es "solo pasillo".
    assert.equal(columnasDelMapa(5, filas, piso.celdas_especiales, '48px', '24px'), '48px 48px 48px 48px 48px');
    assert.equal(columnasDelMapa(5, filas.slice(0, 9), piso.celdas_especiales, '48px', '24px'), '48px 48px 24px 48px 48px');

    assert.equal(claseTipoAsiento('cama'), ' cama');
    assert.equal(claseTipoAsiento('vip'), ' vip');
    assert.equal(claseTipoAsiento('bloqueado'), ' bloqueado');
    assert.equal(claseTipoAsiento('normal'), '');
});

test('asiento bloqueado: conserva su número, no cuenta en la capacidad y vuelve a ser normal', async () => {
    const { crearModeloNuevo, cambiarCelda, resumir, aDistribucion, desdeDistribucion } = await cargar();
    let m = cambiarCelda(crearModeloNuevo(1), 0, 0, 1, 'bloqueado');

    assert.equal(dibujo(m)[0], '1 x2 · 3 4');
    assert.equal(resumir(m).total, 39);
    assert.equal(resumir(m).bloqueados, 1);
    assert.deepEqual(aDistribucion(m)[0].asientos[1], { fila: 1, columna: 2, numero: 2, tipo: 'bloqueado' });

    // Se guarda y se vuelve a abrir igual.
    assert.equal(dibujo(desdeDistribucion(aDistribucion(m)))[0], '1 x2 · 3 4');

    m = cambiarCelda(m, 0, 0, 1, 'normal');
    assert.equal(dibujo(m)[0], '1 2 · 3 4');
    assert.equal(resumir(m).total, 40);
});

test('capacidad: máximo 60 a la venta y números del 1 al 60 también para los bloqueados', async () => {
    const { crearModeloNuevo, cambiarCelda, insertarFila, validarModelo } = await cargar();

    // 60 asientos a la venta: válido.
    let m = crearModeloNuevo(1);
    for (let i = 0; i < 5; i++) m = insertarFila(m, 0, 10);
    assert.deepEqual(validarModelo(m), []);

    // Uno de ellos bloqueado: 59 a la venta, sigue válido.
    assert.deepEqual(validarModelo(cambiarCelda(m, 0, 0, 0, 'bloqueado')), []);

    // 60 a la venta + 1 bloqueado = 61 números: no cabe.
    const filaExtra = insertarFila(m, 0, 15);
    const conBloqueado = cambiarCelda(cambiarCelda(cambiarCelda(cambiarCelda(filaExtra, 0, 15, 0, 'bloqueado'),
        0, 15, 1, 'pasillo'), 0, 15, 3, 'pasillo'), 0, 15, 4, 'pasillo');
    assert.match(validarModelo(conBloqueado).join(' '), /Entre asientos a la venta y bloqueados hay 61/);

    // Solo asientos bloqueados: no se puede guardar.
    let soloBloqueados = crearModeloNuevo(1);
    soloBloqueados.pisos[0].celdas = [[{ tipo: 'asiento', clase: 'bloqueado', numero: 1, fijo: true }]];
    assert.match(validarModelo(soloBloqueados).join(' '), /al menos un asiento a la venta/);
});

test('filas de distinto ancho: última fila de 6 asientos y las demás de 4 + pasillo', async () => {
    const { crearModeloNuevo, agregarCeldaEnFila, cambiarCelda, aDistribucion, resumir, validarModelo } = await cargar();
    let m = crearModeloNuevo(1);

    // La última fila ocupa el pasillo y crece una celda: se agrega la columna 6.
    m = cambiarCelda(m, 0, 9, 2, 'normal');
    m = agregarCeldaEnFila(m, 0, 9);

    const filas = dibujo(m);
    assert.equal(filas[0], '1 2 · 3 4 _');
    assert.equal(filas[8], '33 34 · 35 36 _');
    assert.equal(filas[9], '37 38 39 40 41 42');
    assert.equal(resumir(m).total, 42);
    assert.deepEqual(validarModelo(m), []);

    // En la cuadrícula guardada, la celda extra de las demás filas es "vacio".
    const [piso] = aDistribucion(m);
    assert.equal(piso.columnas, 6);
    assert.deepEqual(piso.celdas_especiales.find(c => c.fila === 1 && c.columna === 6), { fila: 1, columna: 6, tipo: 'vacio' });
});

test('primera fila con un solo asiento usando «quitar celda» solo en esa fila', async () => {
    const { crearModeloNuevo, quitarCeldaEnFila, agregarCeldaEnFila } = await cargar();
    let m = crearModeloNuevo(1);

    for (let i = 0; i < 4; i++) m = quitarCeldaEnFila(m, 0, 0);

    assert.equal(dibujo(m)[0], '1 _ _ _ _');
    assert.equal(dibujo(m)[1], '2 3 · 4 5');

    // Volver a agregar en esa fila llena primero los espacios vacíos.
    m = agregarCeldaEnFila(m, 0, 0);
    assert.equal(dibujo(m)[0], '1 2 _ _ _');
});

test('quitar celdas recorta las columnas que quedan vacías en todas las filas', async () => {
    const { crearModeloNuevo, agregarCeldaEnFila, quitarCeldaEnFila } = await cargar();
    let m = agregarCeldaEnFila(crearModeloNuevo(1), 0, 9);

    assert.equal(m.pisos[0].celdas[0].length, 6);
    m = quitarCeldaEnFila(m, 0, 9);
    assert.equal(m.pisos[0].celdas[0].length, 5);
    assert.equal(dibujo(m)[9], '37 38 · 39 40');
});

test('una fila no pasa de 8 celdas', async () => {
    const { crearModeloNuevo, agregarCeldaEnFila, LIMITES } = await cargar();
    let m = crearModeloNuevo(1);

    for (let i = 0; i < 10; i++) m = agregarCeldaEnFila(m, 0, 0);

    assert.equal(m.pisos[0].celdas[0].length, LIMITES.columnas);
    assert.equal(agregarCeldaEnFila(m, 0, 0), m);
});

test('una fila nueva copia las columnas de solo pasillo y de solo espacio vacío', async () => {
    const { crearModeloNuevo, agregarCeldaEnFila, cambiarCelda, insertarFila } = await cargar();
    let m = cambiarCelda(agregarCeldaEnFila(crearModeloNuevo(1), 0, 9), 0, 9, 5, 'vacio');

    m = insertarFila(m, 0, 0);
    assert.equal(dibujo(m)[0], '1 2 · 3 4 _');
});

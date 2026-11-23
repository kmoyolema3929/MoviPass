// Ejecutar: node --test tests/combos.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const codigo = readFileSync(join(__dirname, '../frontend/js/combos.js'), 'utf8')
    .replace(/^export /gm, '');

// DOM mínimo: lo justo para combos.js.
function cargar() {
    const insertados = [];
    const errores = [];

    const elemento = (etiqueta) => ({
        tagName: etiqueta.toUpperCase(),
        id: '', value: '', textContent: '', className: '', type: '',
        disabled: false, selected: false, defaultSelected: false,
        children: [], listeners: {},
        replaceChildren(...hijos) { this.children = hijos; },
        appendChild(hijo) { this.children.push(hijo); },
        addEventListener(tipo, accion) { this.listeners[tipo] = accion; },
        closest() { return null; },
        after(nodo) { nodo.anclaDe = this; insertados.push(nodo); },
        remove() { insertados.splice(insertados.indexOf(this), 1); },
    });

    const document = {
        createElement: elemento,
        getElementById: id => insertados.find(nodo => nodo.id === id) ?? null,
    };

    const contexto = vm.createContext({
        document,
        Intl,
        console: { error: (...args) => errores.push(args) },
    });
    vm.runInContext(codigo, contexto);

    const select = (id = 'combo') => Object.assign(elemento('select'), { id });
    const textos = s => s.children.map(o => o.textContent);
    const boton = s => document.getElementById(`${s.id}-reintentar`);

    return { combos: contexto, select, textos, boton, errores, document };
}

const coops = [{ id: 'c1', nombre: 'Andina' }, { id: 'c2', nombre: 'Baños' }];

// Promesa que el test resuelve o rechaza cuando quiere.
function pendiente() {
    let resolver, rechazar;
    const promesa = new Promise((ok, mal) => { resolver = ok; rechazar = mal; });
    return { promesa, resolver, rechazar };
}

test('muestra "Cargando..." deshabilitado y luego "Selecciona..." deshabilitada con las opciones', async () => {
    const { combos, select, textos } = cargar();
    const s = select();
    const carga = pendiente();

    const listo = combos.llenarCombo(s, { cargar: () => carga.promesa });

    assert.equal(s.disabled, true);
    assert.deepEqual(textos(s), ['Cargando...']);

    carga.resolver(coops);
    const items = await listo;

    assert.equal(items.length, 2);
    assert.equal(s.disabled, false);
    assert.deepEqual(textos(s), ['Selecciona...', 'Andina', 'Baños']);
    assert.equal(s.children[0].disabled, true);
    assert.equal(s.children[0].defaultSelected, true);
    assert.equal(s.value, '');
});

test('si solo hay una opción, se selecciona sola', async () => {
    const { combos, select } = cargar();
    const s = select();

    await combos.llenarCombo(s, { cargar: async () => [coops[0]] });

    assert.equal(s.value, 'c1');
    assert.equal(s.children[1].defaultSelected, true);
});

test('con unica: false no se selecciona sola', async () => {
    const { combos, select } = cargar();
    const s = select();

    await combos.llenarCombo(s, { cargar: async () => [coops[0]], unica: false });

    assert.equal(s.value, '');
});

test('al editar muestra el valor guardado; si ya no existe, queda "Selecciona..."', async () => {
    const { combos, select } = cargar();
    const s = select();

    await combos.llenarCombo(s, { cargar: coops, porDefecto: 'c2' });
    assert.equal(s.value, 'c2');

    await combos.llenarCombo(s, { cargar: coops, porDefecto: 'borrada' });
    assert.equal(s.value, '');
});

test('filtro con "Todos": es el valor por defecto y no elige sola la única opción', async () => {
    const { combos, select, textos } = cargar();
    const s = select();

    await combos.llenarCombo(s, { cargar: [coops[0]], todos: 'Todas las cooperativas' });

    assert.deepEqual(textos(s), ['Todas las cooperativas', 'Andina']);
    assert.equal(s.children[0].disabled, false);
    assert.equal(s.value, '');
});

test('sin opciones muestra el mensaje y queda deshabilitado', async () => {
    const { combos, select, textos } = cargar();
    const s = select();

    await combos.llenarCombo(s, { cargar: async () => [], vacio: 'No hay frecuencias' });

    assert.deepEqual(textos(s), ['No hay frecuencias']);
    assert.equal(s.disabled, true);
});

test('si falla muestra el error y "Reintentar" vuelve a cargar', async () => {
    const { combos, select, textos, boton, errores } = cargar();
    const s = select('cooperativa');
    let intentos = 0;
    const reintentados = [];

    const resultado = await combos.llenarCombo(s, {
        cargar: async () => {
            intentos += 1;
            if (intentos === 1) throw new Error('sin conexión');
            return coops;
        },
        error: 'No se pudieron cargar las cooperativas.',
        alReintentar: items => reintentados.push(items.length),
    });

    assert.equal(resultado, null);
    assert.deepEqual(textos(s), ['No se pudieron cargar las cooperativas.']);
    assert.equal(s.disabled, true);
    assert.equal(errores.length, 1);
    assert.equal(boton(s).textContent, 'Reintentar');
    assert.equal(boton(s).anclaDe, s);

    await boton(s).listeners.click();

    assert.equal(intentos, 2);
    assert.equal(boton(s), null);
    assert.equal(s.disabled, false);
    assert.deepEqual(textos(s), ['Selecciona...', 'Andina', 'Baños']);
    assert.deepEqual(reintentados, [2]);
});

test('"Reintentar" puede ir junto a otro elemento (anclaReintentar)', async () => {
    const { combos, select, boton, document } = cargar();
    const s = select();
    const mensaje = document.createElement('div');

    await combos.llenarCombo(s, {
        cargar: async () => { throw new Error('x'); },
        anclaReintentar: mensaje,
    });

    assert.equal(boton(s).anclaDe, mensaje);
});

test('una respuesta vieja no pisa a la carga más reciente', async () => {
    const { combos, select, textos } = cargar();
    const s = select();
    const vieja = pendiente();

    const primera = combos.llenarCombo(s, { cargar: () => vieja.promesa });
    await combos.llenarCombo(s, { cargar: async () => [coops[1]] });
    vieja.resolver(coops);

    assert.equal(await primera, null);
    assert.deepEqual(textos(s), ['Selecciona...', 'Baños']);
});

test('combo dependiente: vaciarCombo lo deja vacío, deshabilitado y cancela su carga', async () => {
    const { combos, select, textos } = cargar();
    const s = select('busObjetivo');
    const carga = pendiente();

    const listo = combos.llenarCombo(s, { cargar: () => carga.promesa });
    combos.vaciarCombo(s, 'Primero elige una cooperativa');
    carga.resolver(coops);

    assert.equal(await listo, null);
    assert.deepEqual(textos(s), ['Primero elige una cooperativa']);
    assert.equal(s.disabled, true);
    assert.equal(s.value, '');
});

test('ponerOpciones sin opción inicial y con valor por defecto (tipo de pasajero)', () => {
    const { combos, select, textos } = cargar();
    const s = select('tipo-1');
    const tipos = [
        { codigo: 'normal', nombre: 'Adulto', descuento: 0 },
        { codigo: 'nino', nombre: 'Niño', descuento: 50 },
    ];

    const valor = combos.ponerOpciones(s, tipos, {
        valor: t => t.codigo,
        texto: t => (t.descuento > 0 ? `${t.nombre} (${t.descuento}% desc.)` : t.nombre),
        inicial: null,
        porDefecto: 'normal',
    });

    assert.equal(valor, 'normal');
    assert.equal(s.value, 'normal');
    assert.deepEqual(textos(s), ['Adulto', 'Niño (50% desc.)']);
    assert.equal(s.disabled, false);
});

test('acepta listas de textos (ciudades)', async () => {
    const { combos, select, textos } = cargar();
    const s = select('origen');

    await combos.llenarCombo(s, { cargar: ['Ambato', 'Quito'], inicial: '¿De dónde sales?', unica: false });

    assert.deepEqual(textos(s), ['¿De dónde sales?', 'Ambato', 'Quito']);
    assert.equal(s.children[1].value, 'Ambato');
});

test('fechaHoyEcuador usa la hora de Ecuador (UTC-5)', () => {
    const { combos } = cargar();

    // 03:00 UTC del 15 de noviembre = 22:00 del 14 en Ecuador.
    assert.equal(combos.fechaHoyEcuador(new Date('2026-11-15T03:00:00Z')), '2026-11-14');
    assert.equal(combos.fechaHoyEcuador(new Date('2026-11-15T05:00:00Z')), '2026-11-15');
    assert.match(combos.fechaHoyEcuador(), /^\d{4}-\d{2}-\d{2}$/);
});

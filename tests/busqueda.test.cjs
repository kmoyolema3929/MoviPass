// Ejecutar: node --test tests/busqueda.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const codigo = readFileSync(
    require('node:path').join(__dirname, '../frontend/js/busqueda.js'), 'utf8'
).replace(/^import .*;\r?\n/, '');

function iniciar(consulta = async () => []) {
    const listeners = {};
    const resultados = [];
    const llamadas = [];
    const elemento = () => ({
        value: '', children: [], hidden: true,
        options: [{ text: '' }], selectedIndex: 0,
        appendChild(hijo) { this.children.push(hijo); },
        replaceChildren() { this.children = []; },
        focus() {},
    });
    const boton = { disabled: false };
    const campos = Object.fromEntries([
        'form-busqueda', 'origen', 'destino', 'fecha', 'errores-busqueda',
    ].map(id => [id, elemento()]));
    const formulario = campos['form-busqueda'];
    formulario.querySelector = () => boton;
    formulario.setAttribute = (nombre, valor) => { formulario[nombre] = valor; };
    formulario.removeAttribute = nombre => { delete formulario[nombre]; };
    formulario.addEventListener = (tipo, callback) => { listeners[tipo] = callback; };
    formulario.dispatchEvent = evento => {
        if (evento.type === 'busqueda:resultados') resultados.push(evento.detail);
        return listeners[evento.type]?.(evento);
    };
    const contexto = vm.createContext({
        document: { getElementById: id => campos[id], createElement: elemento },
        console: { log() {}, table() {}, error() {} },
        CustomEvent: class {
            constructor(type, opciones) { this.type = type; this.detail = opciones.detail; }
        },
        buscarViajes: async criterios => {
            llamadas.push(criterios);
            return consulta(criterios);
        },
    });
    vm.runInContext(codigo, contexto, { filename: 'busqueda.js' });
    const enviar = () => listeners.submit({ preventDefault() {} });
    const mensajes = () => campos['errores-busqueda'].children
        .flatMap(lista => lista.children.map(item => item.textContent));
    const valido = () => {
        campos.origen.value = '1'; campos.origen.options[0].text = ' Ambato ';
        campos.destino.value = '2'; campos.destino.options[0].text = ' Quito ';
        campos.fecha.value = campos.fecha.min;
    };
    return { campos, boton, formulario, resultados, llamadas, enviar, mensajes, valido };
}

const terminar = () => new Promise(resolve => setImmediate(resolve));

test('carga sin ReferenceError y establece la fecha local con ceros', () => {
    const { campos } = iniciar();
    const hoy = new Date();
    assert.equal(campos.fecha.min, `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`);
});

test('campos vacíos generan tres errores sin consultar Supabase', () => {
    const app = iniciar();
    app.enviar();
    assert.equal(app.mensajes().length, 3);
    assert.equal(app.llamadas.length, 0);
});

test('rechaza fechas pasadas y ciudades iguales antes de consultar', () => {
    const app = iniciar();
    app.valido();
    app.campos.fecha.value = '2000-01-01';
    app.campos.destino.value = app.campos.origen.value;
    app.enviar();
    assert.equal(app.mensajes().length, 2);
    assert.equal(app.llamadas.length, 0);
});

test('consulta por nombres, publica resultados y evita envíos simultáneos', async () => {
    let completar;
    const viajes = [{ id: 'viaje-prueba' }];
    const app = iniciar(() => new Promise(resolve => { completar = resolve; }));
    app.valido();
    app.enviar(); app.enviar();
    assert.equal(app.llamadas.length, 1);
    assert.equal(app.llamadas[0].origen, 'Ambato');
    assert.equal(app.llamadas[0].destino, 'Quito');
    assert.equal(app.llamadas[0].fecha, app.campos.fecha.min);
    assert.equal(app.boton.disabled, true);
    completar(viajes);
    await terminar();
    assert.equal(app.resultados.at(-1), viajes);
    assert.equal(app.boton.disabled, false);
    assert.equal(app.formulario['aria-busy'], undefined);
});

test('una búsqueda sin coincidencias entrega una lista vacía sin error', async () => {
    const app = iniciar();
    app.valido(); app.enviar();
    await terminar();
    assert.equal(app.resultados.at(-1).length, 0);
    assert.equal(app.mensajes().length, 0);
});

test('un fallo de red muestra el error y permite reintentar', async () => {
    const app = iniciar(async () => { throw new Error('Sin conexión'); });
    app.valido(); app.enviar();
    await terminar();
    assert.match(app.mensajes()[0], /No se pudo completar/);
    assert.equal(app.boton.disabled, false);
    assert.equal(app.formulario['aria-busy'], undefined);
    app.enviar();
    await terminar();
    assert.equal(app.llamadas.length, 2);
});

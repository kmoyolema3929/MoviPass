const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

function iniciar() {
    const listeners = {};
    const elemento = () => ({
        children: [], hidden: true,
        appendChild(hijo) { this.children.push(hijo); },
        replaceChildren(...hijos) { this.children = hijos; },
        setAttribute(nombre, valor) { this[nombre] = valor; },
        removeAttribute(nombre) { delete this[nombre]; },
        addEventListener(tipo, callback) { listeners[tipo] = callback; },
    });
    const campos = Object.fromEntries([
        'form-busqueda', 'resultados-busqueda', 'estado-resultados', 'tarjetas-viajes',
    ].map(id => [id, elemento()]));
    vm.runInNewContext(readFileSync(join(__dirname, '../frontend/js/resultadosBusqueda.js'), 'utf8'), {
        document: { getElementById: id => campos[id], createElement: elemento },
        URLSearchParams,
    });
    return { campos, emitir: (tipo, detail) => listeners[tipo]({ detail }) };
}

const viaje = {
    id: 'viaje-1', origen: 'Ambato', destino: 'Quito', fecha: '2026-11-03',
    hora: '08:00:00', precio: 8.5, tipoBusNombre: 'Interprovincial',
    cooperativaNombre: '<img src=x onerror=alert(1)>',
};

test('cada viaje genera una tarjeta con datos, texto seguro y enlace propio', () => {
    const app = iniciar();
    app.emitir('busqueda:resultados', [viaje, { ...viaje, id: 'viaje-2' }]);
    const columnas = app.campos['tarjetas-viajes'].children;
    assert.equal(columnas.length, 2);
    assert.match(columnas[0].className, /col-12 col-md-6 col-xl-4/);
    const cuerpo = columnas[0].children[0].children[0];
    assert.equal(cuerpo.children[0].textContent, viaje.cooperativaNombre);
    assert.equal(cuerpo.children[1].textContent, 'Ambato → Quito');
    const valores = cuerpo.children[2].children.map(e => e.textContent);
    assert.ok(valores.includes('03/11/2026'));
    assert.ok(valores.includes('08:00'));
    assert.ok(valores.includes('Interprovincial'));
    assert.ok(valores.includes('$8.50 USD'));
    assert.equal(cuerpo.children[3].href, 'seleccion-asientos.html?viaje_id=viaje-1');
    assert.equal(columnas[1].children[0].children[0].children[3].href,
        'seleccion-asientos.html?viaje_id=viaje-2');
});

test('la carga limpia tarjetas y no anuncia prematuramente cero coincidencias', () => {
    const app = iniciar();
    app.emitir('busqueda:resultados', [viaje]);
    app.emitir('busqueda:cargando');
    assert.equal(app.campos['tarjetas-viajes'].children.length, 0);
    assert.equal(app.campos['estado-resultados'].textContent, 'Buscando viajes…');
    assert.equal(app.campos['resultados-busqueda']['aria-busy'], 'true');
    app.emitir('busqueda:resultados', []);
    assert.match(app.campos['estado-resultados'].textContent, /No se encontraron/);
    assert.equal(app.campos['resultados-busqueda']['aria-busy'], undefined);
});

test('un fallo retira los resultados previos y una búsqueda posterior se recupera', () => {
    const app = iniciar();
    app.emitir('busqueda:resultados', [viaje]);
    app.emitir('busqueda:error');
    assert.equal(app.campos['tarjetas-viajes'].children.length, 0);
    assert.equal(app.campos['resultados-busqueda'].hidden, true);
    app.emitir('busqueda:cargando');
    app.emitir('busqueda:resultados', [viaje]);
    assert.equal(app.campos['resultados-busqueda'].hidden, false);
    assert.equal(app.campos['estado-resultados'].textContent, '1 viaje encontrado.');
});

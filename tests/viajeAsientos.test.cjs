const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '../frontend/pages/seleccion-asientos.html'), 'utf8');
const codigo = html.match(/<script>([\s\S]*?)<\/script>/)[1];

for (const viajeId of ['24148682-2712-467f-8872-283877f85652', null]) {
    test(`lee y conserva el contexto del viaje: ${viajeId ?? 'acceso directo'}`, () => {
        const elementos = new Map();
        const elemento = () => ({
            dataset: {}, children: [], listeners: {},
            classList: { toggle() {}, add() {}, remove() {} },
            appendChild(hijo) { this.children.push(hijo); },
            replaceChildren() { this.children = []; },
            setAttribute() {},
            addEventListener(tipo, callback) { this.listeners[tipo] = callback; },
        });
        const obtener = id => {
            if (!elementos.has(id)) elementos.set(id, elemento());
            return elementos.get(id);
        };
        const search = viajeId ? `?viaje_id=${viajeId}` : '';
        const location = { search, href: `http://localhost/frontend/pages/seleccion-asientos.html${search}` };
        vm.runInNewContext(codigo, {
            URL, URLSearchParams, window: { location },
            document: { getElementById: obtener, createElement: elemento, querySelectorAll: () => [] },
            sessionStorage: { setItem() {} },
        });
        assert.equal(obtener('mapaAsientos').dataset.viajeId, viajeId ?? undefined);
        // Simula seleccionar un asiento disponible y continuar al resumen.
        const asiento = obtener('mapaAsientos').children[0].children[1];
        asiento.listeners.click();
        obtener('btnContinuar').listeners.click();
        const destino = new URL(location.href);
        assert.equal(destino.pathname, '/frontend/pages/compra/resumen-compra.html');
        assert.equal(destino.searchParams.get('viaje_id'), viajeId);
    });
}

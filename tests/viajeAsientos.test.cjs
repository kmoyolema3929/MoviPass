const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// La página carga la lógica como módulo; el contexto del viaje se conserva con
// los ayudantes de rutasCompra.js (probados aquí sin DOM ni Supabase).
const html = readFileSync(join(__dirname, '../frontend/pages/seleccion-asientos.html'), 'utf8');
const modulo = readFileSync(join(__dirname, '../frontend/js/seleccionAsientos.js'), 'utf8');

test('seleccion-asientos.html carga la lógica como módulo', () => {
    assert.match(
        html,
        /<script\s+type="module"\s+src="\.\.\/js\/seleccionAsientos\.js"><\/script>/
    );
});

test('la pantalla usa los ayudantes que conservan el viaje', () => {
    assert.match(modulo, /leerViajeId\(window\.location\.search\)/);
    assert.match(modulo, /urlResumenCompra\(viaje\.id\)/);
});

for (const viajeId of ['24148682-2712-467f-8872-283877f85652', null]) {
    test(`lee y conserva el contexto del viaje: ${viajeId ?? 'acceso directo'}`, async () => {
        const { leerViajeId, urlResumenCompra } = await import('../frontend/js/rutasCompra.js');

        const search = viajeId ? `?viaje_id=${viajeId}` : '';
        assert.equal(leerViajeId(search), viajeId);

        // El resumen se abre desde pages/seleccion-asientos.html.
        const destino = new URL(
            urlResumenCompra(viajeId),
            `http://localhost/frontend/pages/seleccion-asientos.html${search}`
        );

        assert.equal(destino.pathname, '/frontend/pages/compra/resumen-compra.html');
        assert.equal(destino.searchParams.get('viaje_id'), viajeId);
    });
}

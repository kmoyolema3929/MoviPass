// Ejecutar: node --test tests/gruposBus.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const codigo = readFileSync(join(__dirname, '../frontend/js/gruposBus.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
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
    const supabase = { from(tabla) { llamadas.push(['from', tabla]); return consulta; } };
    const contexto = vm.createContext({ supabase });
    vm.runInContext(codigo, contexto);
    return { grupos: contexto, llamadas };
}

const existentes = [
    { id: 'g1', nombre: 'Cómodos (importados)' },
    { id: 'g2', nombre: 'Rancheras' },
];

test('normaliza el nombre: sin espacios sobrantes', () => {
    const { grupos } = cargar();
    assert.equal(grupos.normalizarNombreGrupo('  Cómodos   (importados) '), 'Cómodos (importados)');
    assert.equal(grupos.normalizarNombreGrupo(null), '');
});

test('nombre vacío o demasiado largo', () => {
    const { grupos } = cargar();
    assert.equal(grupos.validarNombreGrupo('', existentes), 'Escribe el nombre del grupo.');
    assert.match(grupos.validarNombreGrupo('x'.repeat(41), existentes), /máximo 40/);
    assert.equal(grupos.validarNombreGrupo('x'.repeat(40), existentes), '');
});

test('no se repite el nombre, sin distinguir mayúsculas ni espacios', () => {
    const { grupos } = cargar();
    assert.equal(grupos.validarNombreGrupo('RANCHERAS', existentes), 'Ya tienes un grupo con ese nombre.');
    assert.equal(grupos.validarNombreGrupo('cómodos  (importados)', existentes), 'Ya tienes un grupo con ese nombre.');
    assert.equal(grupos.validarNombreGrupo('Provinciales (viajes cortos)', existentes), '');
});

test('al renombrar, el propio grupo no cuenta como repetido', () => {
    const { grupos } = cargar();
    assert.equal(grupos.validarNombreGrupo('rancheras', existentes, 'g2'), '');
    assert.equal(grupos.validarNombreGrupo('Rancheras', existentes, 'g1'), 'Ya tienes un grupo con ese nombre.');
});

test('texto de la cantidad de buses', () => {
    const { grupos } = cargar();
    assert.equal(grupos.textoBuses(0), 'Sin buses');
    assert.equal(grupos.textoBuses(1), '1 bus');
    assert.equal(grupos.textoBuses(3), '3 buses');
});

test('mensajes de error de la base', () => {
    const { grupos } = cargar();
    const enUso = 'No se puede eliminar el grupo «Rancheras» porque tiene 2 buses.';

    assert.equal(grupos.mensajeErrorGrupo({ code: '23503', message: enUso }, 'eliminar'), enUso);
    assert.equal(grupos.mensajeErrorGrupo({ code: '23505', message: 'duplicate key' }), 'Ya tienes un grupo con ese nombre.');
    assert.match(
        grupos.mensajeErrorGrupo({ code: '23505', message: 'Ya existe una plantilla de asientos para «X».' }),
        /plantilla de asientos/
    );
    assert.match(grupos.mensajeErrorGrupo({ code: '42501' }), /permisos/);
    assert.match(grupos.mensajeErrorGrupo({}, 'eliminar'), /No se pudo eliminar el grupo/);
});

test('obtenerGruposBus trae los grupos de la cooperativa con su cantidad de buses', async () => {
    const { grupos, llamadas } = cargar({
        data: [
            { id: 'g2', nombre: 'Rancheras', buses: [{ count: 0 }] },
            { id: 'g1', nombre: 'Cómodos', buses: [{ count: 4 }] },
        ],
    });

    const lista = await grupos.obtenerGruposBus('coop-1');

    assert.deepEqual(llamadas, [
        ['from', 'grupos_bus'],
        ['select', 'id, nombre, buses(count)'],
        ['eq', 'cooperativa_id', 'coop-1'],
        ['order', 'nombre'],
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(lista)), [
        { id: 'g1', nombre: 'Cómodos', buses: 4 },
        { id: 'g2', nombre: 'Rancheras', buses: 0 },
    ]);
});

test('obtenerGruposBus lanza el error de la consulta', async () => {
    const { grupos } = cargar({ error: { message: 'sin conexión' } });
    await assert.rejects(grupos.obtenerGruposBus('coop-1'), { message: 'sin conexión' });
});

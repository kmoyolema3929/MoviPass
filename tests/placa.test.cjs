// Ejecutar: node --test tests/placa.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');

const casos = [
    ['abc1234', { placa: 'ABC-1234', valida: true }],
    ['ABC-1234', { placa: 'ABC-1234', valida: true }],
    [' abc 1234 ', { placa: 'ABC-1234', valida: true }],
    ['AB-1234', { placa: 'AB1234', valida: false }],
    ['ABC-123', { placa: 'ABC123', valida: false }],
    ['ABCD-1234', { placa: 'ABCD1234', valida: false }],
];

for (const [entrada, esperado] of casos) {
    test(`normalizarPlaca(${JSON.stringify(entrada)})`, async () => {
        const { normalizarPlaca } = await import('../frontend/js/validaciones.js');

        assert.deepEqual(normalizarPlaca(entrada), esperado);
    });
}

// Mientras se escribe: mayúsculas, guion automático, sin espacios ni símbolos, máximo 8
const escritura = [
    ['abc1234', 'ABC-1234'],
    ['abc', 'ABC'],
    ['abc-', 'ABC-'],
    ['ab c1', 'ABC-1'],
    ['a.b*c_12', 'ABC-12'],
    ['ABC-12345', 'ABC-1234'],
];

for (const [entrada, esperado] of escritura) {
    test(`formatearPlacaEscrita(${JSON.stringify(entrada)})`, async () => {
        const { formatearPlacaEscrita } = await import('../frontend/js/validaciones.js');

        assert.equal(formatearPlacaEscrita(entrada), esperado);
    });
}

// Al pegar: se normaliza y se recorta a 8
const pegado = [
    ['  abc 1234  ', 'ABC-1234'],
    ['abc-1234 placa extra', 'ABC-1234'],
];

for (const [entrada, esperado] of pegado) {
    test(`formatearPlacaPegada(${JSON.stringify(entrada)})`, async () => {
        const { formatearPlacaPegada } = await import('../frontend/js/validaciones.js');

        assert.equal(formatearPlacaPegada(entrada), esperado);
    });
}

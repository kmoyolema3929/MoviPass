// Ejecutar: node --test tests/personal.test.cjs
// Personal de la cooperativa (cambio 6, parte 4): oficinistas y usuarios bus.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const cargar = () => import('../frontend/js/personal.js');
const leer = ruta => readFileSync(join(__dirname, '..', ruta), 'utf8');

const persona = {
    cedula: '1712345675',
    nombres: ' Pedro  ',
    apellidos: 'Chofer',
    email: 'Pedro@Correo.com ',
    telefono: '',
    password: '12345678',
    funcion: 'chofer'
};

test('una persona válida no tiene errores (teléfono opcional)', async () => {
    const { revisarPersona } = await cargar();

    assert.deepEqual(revisarPersona(persona, { funcion: true }), {});
    assert.deepEqual(revisarPersona({ ...persona, telefono: '0991234567' }, { funcion: true }), {});
    assert.deepEqual(revisarPersona({ ...persona, cedula: '3012345678' }), {});
});

test('mismas validaciones del registro: cédula, nombres, correo, teléfono y contraseña', async () => {
    const { revisarPersona } = await cargar();
    const errores = revisarPersona({
        cedula: '1712345678', nombres: 'P', apellidos: '', email: 'pedro@', telefono: '0812345678', password: '1234567'
    });

    assert.deepEqual(Object.keys(errores).sort(), ['apellidos', 'cedula', 'email', 'nombres', 'password', 'telefono']);
    assert.match(errores.cedula, /cédula ingresada no es válida/);
    assert.match(errores.telefono, /empezar con 09/);
    assert.match(errores.password, /al menos 8/);
});

test('función del usuario bus: chofer, controlador o dueño', async () => {
    const { revisarPersona, textoFuncion, FUNCIONES_BUS } = await cargar();

    assert.match(revisarPersona({ ...persona, funcion: '' }, { funcion: true }).funcion, /chofer, controlador o dueño/);
    assert.match(revisarPersona({ ...persona, funcion: 'mecanico' }, { funcion: true }).funcion, /Elige la función/);
    assert.deepEqual(Object.keys(FUNCIONES_BUS), ['chofer', 'controlador', 'dueno']);
    assert.equal(textoFuncion('dueno'), 'Dueño');
    assert.equal(textoFuncion(null), '');
});

test('al editar no se piden correo ni contraseña', async () => {
    const { revisarPersona } = await cargar();
    assert.deepEqual(revisarPersona({ ...persona, email: '', password: '' }, { cuenta: false, funcion: true }), {});
});

test('ubicación de la oficina: obligatoria, de 3 a 120 caracteres', async () => {
    const { revisarUbicacion } = await cargar();

    assert.equal(revisarUbicacion('Terminal de Ambato, ventanilla 12'), '');
    assert.match(revisarUbicacion('  '), /Escribe la ubicación/);
    assert.match(revisarUbicacion('ab'), /Escribe la ubicación/);
    assert.match(revisarUbicacion('x'.repeat(121)), /Máximo 120/);
});

test('mensajes de error de la cuenta y de la base', async () => {
    const { mensajeErrorCuenta, mensajeErrorPersonal } = await cargar();
    const asignado = 'No se puede quitar porque está asignado al bus 15 (PBA-1234). Primero cámbialo en Gestión de buses.';

    assert.match(mensajeErrorCuenta({ message: 'User already registered' }), /ya se encuentra registrado/);
    assert.match(mensajeErrorCuenta({ message: 'Database error saving new user' }), /cédula no esté registrada/);
    assert.equal(mensajeErrorPersonal({ code: '23503', message: asignado }), asignado);
    assert.match(mensajeErrorPersonal({ code: 'PGRST202', message: 'Could not find the function' }), /Falta aplicar una migración/);
});

test('pantallas: obligatorios con * y opcionales con (opcional)', () => {
    const oficinistas = leer('frontend/pages/cooperativa/gestor-oficinistas.html');
    const usuariosBus = leer('frontend/pages/cooperativa/gestor-usuarios-bus.html');

    for (const etiqueta of ['Nombres \\*', 'Apellidos \\*', 'Cédula \\*', 'Ubicación de la oficina \\*',
        'Correo electrónico \\*', 'Contraseña temporal \\*']) {
        assert.match(oficinistas, new RegExp(`>${etiqueta}<`));
    }

    for (const etiqueta of ['Cédula \\*', 'Nombres \\*', 'Apellidos \\*', 'Función \\*', 'Teléfono \\(opcional\\)',
        'Correo electrónico \\*', 'Contraseña \\*']) {
        assert.match(usuariosBus, new RegExp(`>${etiqueta}<`));
    }

    assert.match(oficinistas, /<th>Ubicación de la oficina<\/th>/);
    assert.match(usuariosBus, /<th>Bus asignado<\/th>/);
});

test('el panel de la cooperativa enlaza oficinistas y usuarios bus', () => {
    const panel = leer('frontend/pages/cooperativa/index.html');

    assert.match(panel, /href="gestor-oficinistas\.html"/);
    assert.match(panel, /href="gestor-usuarios-bus\.html"/);
});

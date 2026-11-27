// Ejecutar: node --test tests/reglasCuenta.test.cjs
// Cambio 3, parte 3.1: registro, acceso y perfil.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const cargar = () => import('../frontend/js/reglasCuenta.js');
const leer = ruta => readFileSync(join(__dirname, '..', ruta), 'utf8');

const HOY = '2026-11-15';
const valido = {
    cedula: '1712345675',
    nombres: '  María   José ',
    apellidos: "Pérez D'Alessandro",
    fecha_nacimiento: '1995-03-20',
    telefono: '',
    email: ' Maria@Correo.COM ',
    password: 'Viaje#2026',
    confirmacion: 'Viaje#2026',
    terminos: true
};

test('un registro válido no tiene errores (teléfono opcional)', async () => {
    const { revisarRegistro } = await cargar();

    assert.deepEqual(revisarRegistro(valido, { hoy: HOY }), {});
    assert.deepEqual(revisarRegistro({ ...valido, telefono: '0991234567' }, { hoy: HOY }), {});
});

test('registro: cada campo obligatorio tiene su mensaje', async () => {
    const { revisarRegistro } = await cargar();
    const errores = revisarRegistro({
        cedula: '1712345678', nombres: 'A', apellidos: '', fecha_nacimiento: '', telefono: '0812345678',
        email: 'no-es-correo', password: 'corta1', confirmacion: 'otra', terminos: false
    }, { hoy: HOY });

    assert.deepEqual(Object.keys(errores).sort(), [
        'apellidos', 'cedula', 'confirmacion', 'email', 'fecha_nacimiento', 'nombres', 'password', 'telefono', 'terminos'
    ]);
    assert.match(errores.cedula, /no es válida/);
    assert.match(errores.terminos, /Términos de uso y la Política de privacidad/);
    assert.match(errores.confirmacion, /no coinciden/);
});

test('contraseña segura (regla de Supabase): 8 o más, con minúscula, mayúscula, número y símbolo', async () => {
    const { revisarPassword, revisarConfirmacion, faltantesPassword, SIMBOLOS_PASSWORD } = await cargar();

    assert.equal(revisarPassword('Viaje#2026'), '');
    assert.equal(revisarPassword('aB3~xxxx'), '');
    // Cada símbolo que acepta Supabase sirve.
    for (const simbolo of SIMBOLOS_PASSWORD) assert.equal(revisarPassword(`Viaje2026${simbolo}`), '', simbolo);

    // El mensaje dice exactamente qué falta.
    assert.equal(revisarPassword('viaje#2026'), 'A la contraseña le falta: una mayúscula.');
    assert.equal(revisarPassword('VIAJE#2026'), 'A la contraseña le falta: una minúscula.');
    assert.equal(revisarPassword('Viaje#abc'), 'A la contraseña le falta: un número.');
    assert.equal(revisarPassword('Viaje2026'), 'A la contraseña le falta: un símbolo (por ejemplo ! @ # $).');
    assert.equal(revisarPassword('Ab1!'), 'A la contraseña le falta: al menos 8 caracteres.');
    assert.equal(revisarPassword('12345678'),
        'A la contraseña le falta: una minúscula, una mayúscula y un símbolo (por ejemplo ! @ # $).');
    assert.equal(revisarPassword(''), 'Escribe una contraseña.');

    // Como en Supabase: ñ, tildes y espacios no cuentan como minúscula, mayúscula ni símbolo.
    assert.deepEqual(faltantesPassword('ÑÚ 2026#x'), ['una mayúscula']);
    assert.deepEqual(faltantesPassword('ñú 2026#X'), ['una minúscula']);
    assert.deepEqual(faltantesPassword('Viaje 2026'), ['un símbolo (por ejemplo ! @ # $)']);

    assert.match(revisarPassword('aB1!'.repeat(19)), /máximo 72/);
    assert.match(revisarConfirmacion('Viaje#2026', ''), /Vuelve a escribir/);
    assert.equal(revisarConfirmacion('Viaje#2026', 'Viaje#2026'), '');
});

test('contraseña nueva (recuperar contraseña): misma regla y confirmación', async () => {
    const { revisarNuevaPassword } = await cargar();

    assert.deepEqual(revisarNuevaPassword('Viaje#2026', 'Viaje#2026'), {});
    assert.deepEqual(revisarNuevaPassword('viaje2026', 'otra'), {
        password: 'A la contraseña le falta: una mayúscula y un símbolo (por ejemplo ! @ # $).',
        confirmacion: 'Las contraseñas no coinciden.'
    });
});

test('edad con la fecha de Ecuador: mayor de 18 años', async () => {
    const { calcularEdad, revisarFechaNacimiento, fechaMaximaNacimiento, textoEdad } = await cargar();

    assert.equal(calcularEdad('2008-11-15', HOY), 18);
    assert.equal(calcularEdad('2008-11-16', HOY), 17);
    assert.equal(calcularEdad('2000-02-29', '2026-02-28'), 25);
    assert.equal(calcularEdad('2026-02-31', HOY), null);
    assert.equal(revisarFechaNacimiento('2008-11-15', HOY), '');
    assert.match(revisarFechaNacimiento('2008-11-16', HOY), /mayor de 18 años/);
    assert.match(revisarFechaNacimiento('2027-01-01', HOY), /futura/);
    assert.match(revisarFechaNacimiento('', HOY), /Escribe tu fecha/);
    assert.match(revisarFechaNacimiento('1890-01-01', HOY), /Revisa/);
    assert.equal(fechaMaximaNacimiento(HOY), '2008-11-15');
    assert.equal(fechaMaximaNacimiento('2028-02-29'), '2010-02-28');
    assert.equal(textoEdad('1995-03-20', HOY), '31 años');
});

test('nombres: de 2 a 80 letras, con tildes, eñes, apóstrofo y guion', async () => {
    const { revisarNombre, limpiarTexto } = await cargar();

    assert.equal(revisarNombre('José Ñuñez'), '');
    assert.equal(revisarNombre("O'Brien-Pérez", 'apellidos'), '');
    assert.match(revisarNombre('J'), /mínimo 2/);
    assert.match(revisarNombre('Juan2'), /solo pueden tener letras/);
    assert.match(revisarNombre('--'), /solo pueden tener letras/);
    assert.match(revisarNombre('a'.repeat(81)), /Máximo 80/);
    assert.equal(limpiarTexto('  María   José '), 'María José');
});

test('datos del signUp: limpios, teléfono vacío como null y origen', async () => {
    const { datosDeSignUp } = await cargar();

    assert.deepEqual(datosDeSignUp(valido), {
        cedula: '1712345675',
        nombres: 'María José',
        apellidos: "Pérez D'Alessandro",
        telefono: null,
        fecha_nacimiento: '1995-03-20',
        acepta_terminos: true,
        origen: 'registro'
    });
    // El personal no acepta términos al crearse (lo crea el gerente o el administrador).
    assert.equal(datosDeSignUp(valido, 'personal').acepta_terminos, false);
    assert.equal(datosDeSignUp(valido, 'personal').origen, 'personal');
});

test('perfiles antiguos: qué deben corregir al entrar', async () => {
    const { pendientesDelPerfil } = await cargar();
    const bueno = { cedula: '1712345675', nombres: 'Ana', apellidos: 'Loor', fecha_nacimiento: '1990-01-01' };

    assert.deepEqual(pendientesDelPerfil(bueno), []);
    assert.deepEqual(pendientesDelPerfil({ ...bueno, cedula: '', nombres: 'A', fecha_nacimiento: null }),
        ['cedula', 'nombres', 'fecha_nacimiento']);
    // Si la columna todavía no existe (migración sin aplicar), no se exige la fecha.
    const { fecha_nacimiento, ...sinColumna } = bueno;
    assert.deepEqual(pendientesDelPerfil(sinColumna), []);
    assert.deepEqual(pendientesDelPerfil(null), []);
});

test('código de verificación de 6 dígitos', async () => {
    const { revisarCodigo } = await cargar();

    assert.equal(revisarCodigo('123456'), '');
    assert.equal(revisarCodigo(' 123 456 '), '');
    assert.match(revisarCodigo('12345'), /6 dígitos/);
    assert.match(revisarCodigo('12a456'), /6 dígitos/);
});

test('mensajes claros de Supabase Auth', async () => {
    const { mensajeErrorAuth } = await cargar();

    assert.equal(mensajeErrorAuth({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
        'Correo o contraseña incorrectos.');
    assert.match(mensajeErrorAuth({ message: 'Email not confirmed' }), /no está verificada/);
    assert.match(mensajeErrorAuth({ code: 'otp_expired', message: 'Token has expired or is invalid' }), /ya venció/);
    assert.match(mensajeErrorAuth({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }), /Demasiados intentos/);
    assert.match(mensajeErrorAuth({ code: 'weak_password' }), /minúscula, mayúscula, número y símbolo/);
    assert.match(mensajeErrorAuth({ code: 'same_password' }), /distinta/);
    assert.match(mensajeErrorAuth({ message: 'Database error saving new user' }), /cédula ya esté registrada/);
    assert.match(mensajeErrorAuth(new TypeError('Failed to fetch')), /conexión/);
    assert.doesNotMatch(mensajeErrorAuth({ message: 'Something odd happened' }), /Something/);
});

test('errores de la base: mensajes propios en español y nada técnico', async () => {
    const { mensajeErrorBase } = await import('../frontend/js/erroresBase.js');

    assert.equal(mensajeErrorBase({ code: '23505', message: 'Esta cédula ya está registrada en otra cuenta.' }),
        'Esta cédula ya está registrada en otra cuenta.');
    assert.equal(mensajeErrorBase({ code: '23505', message: 'duplicate key value violates unique constraint "x"' }),
        'Ese dato ya está registrado.');
    assert.match(mensajeErrorBase({ code: '42501', message: 'permission denied for table perfiles' }), /no tiene permiso/);
    assert.match(mensajeErrorBase({ code: 'PGRST202', message: 'Could not find the function' }), /migración/);
    assert.match(mensajeErrorBase(new TypeError('Failed to fetch')), /conexión/);
    assert.match(mensajeErrorBase({ code: 'XX000', message: 'boom' }, 'guardar tus datos'), /No se pudo guardar tus datos/);
});

test('pantallas: registro, login, verificación, recuperación y perfil', () => {
    const registro = leer('frontend/pages/registro.html');
    const login = leer('frontend/pages/login.html');
    const perfil = leer('frontend/pages/perfil.html');

    for (const etiqueta of ['Cédula \\*', 'Fecha de nacimiento \\*', 'Nombres \\*', 'Apellidos \\*',
        'Correo electrónico \\*', 'Teléfono \\(opcional\\)', 'Contraseña \\*', 'Confirmar contraseña \\*']) {
        assert.match(registro, new RegExp(`>${etiqueta}<`));
    }
    assert.match(registro, /\* Campo obligatorio/);
    assert.match(registro, /href="terminos\.html"[^>]*>Términos de uso</);
    assert.match(registro, /href="privacidad\.html"[^>]*>Política de privacidad</);

    assert.match(login, /href="recuperar-contrasena\.html"[^>]*>¿Olvidaste tu contraseña\?</);
    assert.match(login, /id="avisoVerificar"/);

    for (const etiqueta of ['Cédula \\*', 'Fecha de nacimiento \\*', 'Nombres \\*', 'Apellidos \\*', 'Teléfono \\(opcional\\)']) {
        assert.match(perfil, new RegExp(`>${etiqueta}<`));
    }
    assert.match(perfil, /El rol no se puede cambiar/);

    for (const pagina of ['verificar-correo', 'recuperar-contrasena', 'nueva-contrasena', 'terminos', 'privacidad']) {
        assert.match(leer(`frontend/pages/${pagina}.html`), /<html lang="es">/);
    }
    assert.match(leer('frontend/js/verificarCorreo.js'), /verifyOtp\(\{ email: correo, token: codigo, type: 'email' \}\)/);
    assert.match(leer('frontend/js/recuperarContrasena.js'), /resetPasswordForEmail\(correo, \{ redirectTo: RUTA_NUEVA \}\)/);
});

test('migración 3.1: seguridad de perfiles y comprobantes', () => {
    const sql = leer('supabase/migrations/20261121090000_registro_acceso_perfil.sql');

    assert.match(sql, /^begin;/m);
    assert.match(sql, /^commit;/m);
    assert.match(sql, /drop policy if exists "lectura de perfiles para autenticados" on public\.perfiles;/);
    assert.match(sql, /drop policy if exists "personal ve comprobantes" on storage\.objects;/);
    assert.match(sql, /revoke all on table public\.perfiles from anon;/);
    assert.match(sql, /create policy "gerente ve su personal"/);
    // La función de los nombres del boleto no se puede usar sin sesión.
    assert.match(sql, /'public\.nombres_de_mi_ultimo_boleto\(text\)'/);
    assert.match(sql, /revoke all on function %s from public, anon/);
    // Quitar personal: la cuenta vuelve a ser cliente.
    assert.equal((sql.match(/set rol = 'cliente',\s+estado = 'activo'/g) ?? []).length, 3);
    // Fecha de Ecuador.
    assert.match(sql, /at time zone 'America\/Guayaquil'/);
});

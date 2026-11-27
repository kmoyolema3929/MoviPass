// frontend/js/reglasCuenta.js
// Reglas de las cuentas (cambio 3, parte 3.1): registro, perfil, contraseña
// y mensajes de Supabase Auth. Sin DOM ni Supabase (se prueban con node --test).
// La base repite las mismas reglas (validar_perfil y crear_perfil_al_registrar).

import { cedulaValida } from './validaciones.js';
import { fechaHoyEcuador } from './combos.js';

export const LIMITES_CUENTA = {
    nombre: 80,
    correo: 254,
    passwordMinimo: 8,
    passwordMaximo: 72,
    edadMinima: 18,
    edadMaxima: 120,
    codigo: 6
};

const LETRAS = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
const NOMBRE = new RegExp(`^[${LETRAS}' .-]+$`);
const CON_LETRA = new RegExp(`[${LETRAS}]`);

/** Quita espacios al inicio y al final y deja uno solo entre palabras. */
export const limpiarTexto = texto => String(texto ?? '').trim().replace(/\s+/g, ' ');

/** Correo limpio y en minúsculas. */
export const limpiarCorreo = texto => String(texto ?? '').trim().toLowerCase();

/** Problema de la cédula ('' si está bien). */
export function revisarCedula(texto) {
    const cedula = limpiarTexto(texto);
    if (!cedula) return 'Escribe la cédula.';
    return cedulaValida(cedula) ? '' : 'La cédula ingresada no es válida.';
}

/** Problema de nombres o apellidos ('' si está bien). */
export function revisarNombre(texto, campo = 'nombres') {
    const valor = limpiarTexto(texto);

    if (valor.length < 2) return `Escribe los ${campo} (mínimo 2 letras).`;
    if (valor.length > LIMITES_CUENTA.nombre) return `Máximo ${LIMITES_CUENTA.nombre} caracteres.`;
    if (!NOMBRE.test(valor) || !CON_LETRA.test(valor)) return `Los ${campo} solo pueden tener letras y espacios.`;

    return '';
}

/** Teléfono opcional: vacío o 09xxxxxxxx. */
export function revisarTelefono(texto) {
    const telefono = limpiarTexto(texto);
    return !telefono || /^09\d{8}$/.test(telefono) ? '' : 'El teléfono debe tener 10 dígitos y empezar con 09.';
}

export function revisarCorreo(texto) {
    const correo = limpiarCorreo(texto);

    if (!correo) return 'Escribe tu correo electrónico.';
    if (correo.length > LIMITES_CUENTA.correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        return 'Escribe un correo electrónico válido.';
    }

    return '';
}

/**
 * Símbolos que acepta Supabase Auth en la regla
 * "Lowercase, uppercase letters, digits and symbols".
 */
export const SIMBOLOS_PASSWORD = '!@#$%^&*()_+-=[]{};\':"|<>?,./`~';

/** Texto de ayuda que va debajo de los campos de contraseña. */
export const REGLA_PASSWORD = 'Mínimo 8 caracteres, con minúscula, mayúscula, número y símbolo (por ejemplo ! @ # $).';

/**
 * Lo que le falta a la contraseña, en el orden de la regla.
 * Las letras se cuentan como Supabase: solo a-z y A-Z (sin tildes ni ñ).
 * @returns {string[]} por ejemplo ['una mayúscula', 'un símbolo']
 */
export function faltantesPassword(password) {
    const valor = String(password ?? '');
    const faltan = [];

    if (valor.length < LIMITES_CUENTA.passwordMinimo) faltan.push(`al menos ${LIMITES_CUENTA.passwordMinimo} caracteres`);
    if (!/[a-z]/.test(valor)) faltan.push('una minúscula');
    if (!/[A-Z]/.test(valor)) faltan.push('una mayúscula');
    if (!/[0-9]/.test(valor)) faltan.push('un número');
    if (![...valor].some(caracter => SIMBOLOS_PASSWORD.includes(caracter))) faltan.push('un símbolo (por ejemplo ! @ # $)');

    return faltan;
}

/** "a, b y c" */
function unirConY(partes) {
    return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}` : partes[0] ?? '';
}

/** Contraseña segura: 8 a 72 caracteres, con minúscula, mayúscula, número y símbolo. */
export function revisarPassword(password) {
    const valor = String(password ?? '');

    if (!valor) return 'Escribe una contraseña.';
    if (valor.length > LIMITES_CUENTA.passwordMaximo) {
        return `La contraseña puede tener máximo ${LIMITES_CUENTA.passwordMaximo} caracteres.`;
    }

    const faltan = faltantesPassword(valor);
    return faltan.length ? `A la contraseña le falta: ${unirConY(faltan)}.` : '';
}

export function revisarConfirmacion(password, confirmacion) {
    if (!String(confirmacion ?? '')) return 'Vuelve a escribir la contraseña.';
    return password === confirmacion ? '' : 'Las contraseñas no coinciden.';
}

function leerFecha(fechaISO) {
    const texto = String(fechaISO ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;

    const [y, m, d] = texto.split('-').map(Number);
    const fecha = new Date(Date.UTC(y, m - 1, d));

    // 2026-02-31 no existe: Date lo pasaría a marzo.
    return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d
        ? { y, m, d }
        : null;
}

/**
 * Edad cumplida en una fecha (por defecto, hoy en Ecuador). null si la fecha no es válida.
 * @param {string} fechaNacimiento AAAA-MM-DD
 * @param {string} [hoy] AAAA-MM-DD
 */
export function calcularEdad(fechaNacimiento, hoy = fechaHoyEcuador()) {
    const nacimiento = leerFecha(fechaNacimiento);
    const actual = leerFecha(hoy);
    if (!nacimiento || !actual) return null;

    let edad = actual.y - nacimiento.y;
    if (actual.m < nacimiento.m || (actual.m === nacimiento.m && actual.d < nacimiento.d)) edad -= 1;

    return edad;
}

/** Fecha de nacimiento obligatoria y mayor de 18 años ('' si está bien). */
export function revisarFechaNacimiento(fechaNacimiento, hoy = fechaHoyEcuador()) {
    if (!String(fechaNacimiento ?? '').trim()) return 'Escribe tu fecha de nacimiento.';

    const edad = calcularEdad(fechaNacimiento, hoy);

    if (edad === null) return 'La fecha de nacimiento no es válida.';
    if (String(fechaNacimiento) > hoy) return 'La fecha de nacimiento no puede ser futura.';
    if (edad < LIMITES_CUENTA.edadMinima) {
        return 'Debes ser mayor de 18 años para tener una cuenta. Los menores viajan como acompañantes.';
    }
    if (edad > LIMITES_CUENTA.edadMaxima) return 'Revisa la fecha de nacimiento.';

    return '';
}

/** Fecha máxima del calendario: hoy hace 18 años (AAAA-MM-DD). */
export function fechaMaximaNacimiento(hoy = fechaHoyEcuador()) {
    const { y, m, d } = leerFecha(hoy);
    const fecha = new Date(Date.UTC(y - LIMITES_CUENTA.edadMinima, m - 1, d));

    // 29 de febrero -> 28 de febrero si ese año no es bisiesto.
    if (fecha.getUTCMonth() !== m - 1) fecha.setUTCDate(0);

    return fecha.toISOString().slice(0, 10);
}

/** "35 años" para mostrar junto a la fecha. */
export function textoEdad(fechaNacimiento, hoy = fechaHoyEcuador()) {
    const edad = calcularEdad(fechaNacimiento, hoy);
    if (edad === null || edad < 0) return '';
    return `${edad} ${edad === 1 ? 'año' : 'años'}`;
}

function sinVacios(errores) {
    return Object.fromEntries(Object.entries(errores).filter(([, problema]) => problema));
}

/**
 * Datos de una persona: cédula, nombres, apellidos, teléfono (opcional) y fecha de nacimiento.
 * Devuelve { campo: problema } (vacío si está bien).
 */
export function revisarDatosPersona(datos, { hoy = fechaHoyEcuador(), nacimiento = true } = {}) {
    return sinVacios({
        cedula: revisarCedula(datos.cedula),
        nombres: revisarNombre(datos.nombres, 'nombres'),
        apellidos: revisarNombre(datos.apellidos, 'apellidos'),
        telefono: revisarTelefono(datos.telefono),
        fecha_nacimiento: nacimiento ? revisarFechaNacimiento(datos.fecha_nacimiento, hoy) : ''
    });
}

/** Registro del cliente: datos de la persona, correo, contraseña, confirmación y términos. */
export function revisarRegistro(datos, { hoy = fechaHoyEcuador() } = {}) {
    return {
        ...revisarDatosPersona(datos, { hoy }),
        ...sinVacios({
            email: revisarCorreo(datos.email),
            password: revisarPassword(datos.password),
            confirmacion: revisarConfirmacion(datos.password, datos.confirmacion),
            terminos: datos.terminos ? '' : 'Debes aceptar los Términos de uso y la Política de privacidad.'
        })
    };
}

/** Contraseña nueva (recuperar contraseña). */
export function revisarNuevaPassword(password, confirmacion) {
    return sinVacios({
        password: revisarPassword(password),
        confirmacion: revisarConfirmacion(password, confirmacion)
    });
}

/**
 * Datos que se envían en options.data del signUp (los lee crear_perfil_al_registrar).
 * origen: 'registro' (cliente, acepta términos) o 'personal' (lo crea el gerente o el administrador).
 */
export function datosDeSignUp(datos, origen = 'registro') {
    return {
        cedula: limpiarTexto(datos.cedula),
        nombres: limpiarTexto(datos.nombres),
        apellidos: limpiarTexto(datos.apellidos),
        telefono: limpiarTexto(datos.telefono) || null,
        fecha_nacimiento: String(datos.fecha_nacimiento ?? '').trim(),
        acepta_terminos: origen === 'registro' ? Boolean(datos.terminos) : false,
        origen
    };
}

/**
 * Lo que un perfil guardado debe corregir antes de usar la aplicación
 * (perfiles antiguos: cédula no válida, nombres cortos o sin fecha de nacimiento).
 * @returns {string[]} campos pendientes, en el orden del formulario.
 */
export function pendientesDelPerfil(perfil) {
    if (!perfil) return [];

    const pendientes = [];
    if (!cedulaValida(String(perfil.cedula ?? ''))) pendientes.push('cedula');
    if (limpiarTexto(perfil.nombres).length < 2) pendientes.push('nombres');
    if (limpiarTexto(perfil.apellidos).length < 2) pendientes.push('apellidos');
    // Si la base todavía no tiene la columna (migración sin aplicar), no se exige.
    if ('fecha_nacimiento' in perfil && !perfil.fecha_nacimiento) pendientes.push('fecha_nacimiento');

    return pendientes;
}

export const NOMBRES_CAMPOS = {
    cedula: 'cédula',
    nombres: 'nombres',
    apellidos: 'apellidos',
    fecha_nacimiento: 'fecha de nacimiento'
};

/** Código de 6 dígitos que llega al correo. */
export function revisarCodigo(texto) {
    const codigo = String(texto ?? '').replace(/\s/g, '');
    return new RegExp(`^\\d{${LIMITES_CUENTA.codigo}}$`).test(codigo)
        ? ''
        : `Escribe el código de ${LIMITES_CUENTA.codigo} dígitos que llegó a tu correo.`;
}

/** Sin conexión con el servidor (fetch falló). */
export function esErrorDeConexion(error) {
    const texto = String(error?.message ?? error ?? '');
    return error?.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|load failed|network request failed/i.test(texto);
}

/**
 * Mensaje claro para los errores de Supabase Auth.
 * Usa error.code (supabase-js v2) y, si no viene, el texto del mensaje.
 */
export function mensajeErrorAuth(error) {
    const codigo = String(error?.code ?? '');
    const texto = String(error?.message ?? '');

    if (esErrorDeConexion(error)) return 'No se pudo conectar con el servidor. Revisa tu conexión a internet.';
    if (codigo === 'invalid_credentials' || /invalid login credentials/i.test(texto)) {
        return 'Correo o contraseña incorrectos.';
    }
    if (codigo === 'email_not_confirmed' || /email not confirmed/i.test(texto)) {
        return 'Tu cuenta todavía no está verificada. Escribe el código que llegó a tu correo.';
    }
    if (codigo === 'user_already_exists' || codigo === 'email_exists' || /already registered|already exists/i.test(texto)) {
        return 'Este correo electrónico ya se encuentra registrado.';
    }
    if (codigo === 'weak_password' || /password should|weak password/i.test(texto)) {
        return `La contraseña no es segura. ${REGLA_PASSWORD}`;
    }
    if (codigo === 'same_password' || /should be different/i.test(texto)) {
        return 'La contraseña nueva debe ser distinta de la anterior.';
    }
    if (codigo === 'otp_expired' || /token has expired|expired or is invalid|otp.*(expired|invalid)/i.test(texto)) {
        return 'El código no es correcto o ya venció. Revisa el último correo o pide un código nuevo.';
    }
    if (/rate limit|too many|security purposes/i.test(codigo + ' ' + texto)) {
        return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
    }
    if (codigo === 'unexpected_failure' || /database error/i.test(texto)) {
        return 'No se pudo crear la cuenta. Es posible que la cédula ya esté registrada en otra cuenta; ' +
            'si ya tienes cuenta, inicia sesión o recupera tu contraseña.';
    }
    if (codigo === 'user_banned') return 'Tu cuenta está suspendida. Comunícate con el administrador.';

    return 'No se pudo completar la operación. Inténtalo de nuevo en unos minutos.';
}

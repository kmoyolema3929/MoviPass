// frontend/js/personal.js
// Personal de la cooperativa (cambio 6, parte 4): oficinistas y usuarios bus.
// Reglas sin DOM ni Supabase (se prueban con node --test). Son las mismas del
// registro de clientes; la base las repite (exigir_datos_de_persona).

import { cedulaValida } from './validaciones.js';

/** Funciones de un usuario bus (valor guardado -> texto). */
export const FUNCIONES_BUS = { chofer: 'Chofer', controlador: 'Controlador', dueno: 'Dueño' };

export const LIMITES_PERSONAL = { ubicacion: 120, minimoUbicacion: 3, password: 8 };

export const limpiar = texto => String(texto ?? '').trim().replace(/\s+/g, ' ');

/** "chofer" -> "Chofer"; vacío si no tiene. */
export function textoFuncion(funcion) {
    return FUNCIONES_BUS[funcion] ?? '';
}

/** Problema de la ubicación de la oficina ('' si está bien). */
export function revisarUbicacion(texto) {
    const ubicacion = limpiar(texto);

    if (ubicacion.length < LIMITES_PERSONAL.minimoUbicacion) {
        return 'Escribe la ubicación de la oficina (por ejemplo «Terminal de Ambato, ventanilla 12»).';
    }

    return ubicacion.length > LIMITES_PERSONAL.ubicacion
        ? `Máximo ${LIMITES_PERSONAL.ubicacion} caracteres.`
        : '';
}

/**
 * Revisa los datos de una persona. Devuelve { campo: problema } (vacío si está bien).
 * datos: { cedula, nombres, apellidos, email, telefono, password, funcion }
 * opciones.cuenta: también correo y contraseña (al crear la cuenta).
 * opciones.funcion: exige la función de usuario bus.
 */
export function revisarPersona(datos, { cuenta = true, funcion = false } = {}) {
    const errores = {};
    const cedula = limpiar(datos.cedula);
    const telefono = limpiar(datos.telefono);

    if (!cedulaValida(cedula)) errores.cedula = 'La cédula ingresada no es válida.';
    if (limpiar(datos.nombres).length < 2) errores.nombres = 'Escribe los nombres (mínimo 2 caracteres).';
    if (limpiar(datos.apellidos).length < 2) errores.apellidos = 'Escribe los apellidos (mínimo 2 caracteres).';
    if (telefono && !/^09\d{8}$/.test(telefono)) errores.telefono = 'El teléfono debe tener 10 dígitos y empezar con 09.';

    if (cuenta) {
        const email = limpiar(datos.email).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores.email = 'Escribe un correo electrónico válido.';
        if (String(datos.password ?? '').length < LIMITES_PERSONAL.password) {
            errores.password = `La contraseña debe tener al menos ${LIMITES_PERSONAL.password} caracteres.`;
        }
    }

    if (funcion && !FUNCIONES_BUS[datos.funcion]) {
        errores.funcion = 'Elige la función: chofer, controlador o dueño.';
    }

    return errores;
}

/** Mensaje claro para los errores al crear la cuenta (Supabase Auth). */
export function mensajeErrorCuenta(error) {
    const texto = String(error?.message ?? '');

    if (/already registered|already exists/i.test(texto)) return 'Este correo electrónico ya se encuentra registrado.';
    if (/Database error/i.test(texto)) return 'No se pudo crear la cuenta. Revisa que la cédula no esté registrada.';
    if (/rate limit/i.test(texto)) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
    if (/password/i.test(texto)) return 'La contraseña no cumple los requisitos de seguridad. Usa al menos 8 caracteres.';

    return mensajeErrorPersonal(error);
}

/** Mensaje claro para los errores de las funciones de personal de la base. */
export function mensajeErrorPersonal(error) {
    const texto = String(error?.message ?? '');

    if (error?.code === 'PGRST202' || /could not find the function|schema cache/i.test(texto)) {
        return 'Falta aplicar una migración de base de datos para gestionar al personal. ' +
            'Pide al administrador que ejecute las migraciones pendientes.';
    }

    switch (error?.code) {
        case '23503': // asignado a un bus
        case '23505': // cédula repetida
        case '23514': // datos no válidos (mensaje de la base en español)
            return texto;
        case '42501':
            return texto || 'Tu cuenta no tiene permiso para realizar esta operación.';
        default:
            return texto ? `No se pudo completar la operación: ${texto}` : 'No se pudo completar la operación. Revisa tu conexión.';
    }
}

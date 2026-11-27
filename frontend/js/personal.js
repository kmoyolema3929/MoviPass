// frontend/js/personal.js
// Personal de la cooperativa (cambio 6, parte 4): oficinistas y usuarios bus.
// Reglas sin DOM ni Supabase (se prueban con node --test). Son las mismas del
// registro de clientes (reglasCuenta.js, cambio 3); la base las repite
// (validar_perfil, exigir_datos_de_persona y asignar_cuenta_existente).

import {
    LIMITES_CUENTA, limpiarTexto, mensajeErrorAuth, revisarCedula, revisarCorreo, revisarFechaNacimiento,
    revisarNombre, revisarPassword, revisarTelefono
} from './reglasCuenta.js';
import { mensajeErrorBase } from './erroresBase.js';

/** Funciones de un usuario bus (valor guardado -> texto). */
export const FUNCIONES_BUS = { chofer: 'Chofer', controlador: 'Controlador', dueno: 'Dueño' };

export const LIMITES_PERSONAL = { ubicacion: 120, minimoUbicacion: 3, password: LIMITES_CUENTA.passwordMinimo };

export const limpiar = limpiarTexto;

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

function sinVacios(errores) {
    return Object.fromEntries(Object.entries(errores).filter(([, problema]) => problema));
}

/**
 * Revisa los datos de una persona. Devuelve { campo: problema } (vacío si está bien).
 * datos: { cedula, nombres, apellidos, email, telefono, password, funcion, fecha_nacimiento }
 * opciones.cuenta: también correo, contraseña y fecha de nacimiento (al crear la cuenta).
 * opciones.funcion: exige la función de usuario bus.
 * opciones.hoy: fecha de referencia para la edad (AAAA-MM-DD; por defecto hoy en Ecuador).
 */
export function revisarPersona(datos, { cuenta = true, funcion = false, hoy } = {}) {
    const errores = {
        cedula: revisarCedula(datos.cedula),
        nombres: revisarNombre(datos.nombres, 'nombres'),
        apellidos: revisarNombre(datos.apellidos, 'apellidos'),
        telefono: revisarTelefono(datos.telefono)
    };

    if (cuenta) {
        errores.email = revisarCorreo(datos.email);
        errores.password = revisarPassword(datos.password);
        errores.fecha_nacimiento = hoy === undefined
            ? revisarFechaNacimiento(datos.fecha_nacimiento)
            : revisarFechaNacimiento(datos.fecha_nacimiento, hoy);
    }

    if (funcion && !FUNCIONES_BUS[datos.funcion]) {
        errores.funcion = 'Elige la función: chofer, controlador o dueño.';
    }

    return sinVacios(errores);
}

/** "Asignar una cuenta existente": cédula y correo de una cuenta de cliente. */
export function revisarCuentaExistente(datos, { funcion = false, ubicacion = false } = {}) {
    const errores = {
        cedula: revisarCedula(datos.cedula),
        email: revisarCorreo(datos.email)
    };

    if (funcion && !FUNCIONES_BUS[datos.funcion]) errores.funcion = 'Elige la función: chofer, controlador o dueño.';
    if (ubicacion) errores.ubicacion = revisarUbicacion(datos.ubicacion);

    return sinVacios(errores);
}

/** Mensaje claro para los errores al crear la cuenta (Supabase Auth). */
export function mensajeErrorCuenta(error) {
    const texto = String(error?.message ?? '');

    if (/Database error/i.test(texto)) {
        return 'No se pudo crear la cuenta. Revisa que la cédula no esté registrada y que la persona sea mayor de 18 años.';
    }
    if (error?.code && /^[0-9A-Z]{5}$/.test(error.code)) return mensajeErrorPersonal(error);

    return mensajeErrorAuth(error);
}

/** Mensaje claro para los errores de las funciones de personal de la base. */
export function mensajeErrorPersonal(error) {
    if (error?.code === 'PGRST202' || /could not find the function|schema cache/i.test(String(error?.message ?? ''))) {
        return 'Falta aplicar una migración de base de datos para gestionar al personal. ' +
            'Pide al administrador que ejecute las migraciones pendientes.';
    }

    return mensajeErrorBase(error);
}

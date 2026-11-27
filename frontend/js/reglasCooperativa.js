// frontend/js/reglasCooperativa.js
// Reglas del formulario de cooperativas (cambio 3, parte 3.2). Sin DOM ni
// Supabase (se prueban con node --test). La base repite las mismas reglas
// (disparador validar_cooperativa).

import { limpiarTexto } from './reglasCuenta.js';

export const LIMITES_COOPERATIVA = {
    nombreMinimo: 3,
    nombre: 120,
    direccionMinima: 5,
    direccion: 200
};

/**
 * RUC ecuatoriano: 13 dígitos; provincia 01-24 o 30; tercer dígito 0-6
 * (persona natural o entidad pública) o 9 (sociedad); establecimiento
 * (tres últimos dígitos) desde 001.
 * No se revisa el dígito verificador: el SRI emite RUC de sociedades que no
 * lo cumplen.
 */
export function rucValido(texto) {
    const ruc = String(texto ?? '');
    if (!/^\d{13}$/.test(ruc)) return false;

    const provincia = Number(ruc.slice(0, 2));
    if ((provincia < 1 || provincia > 24) && provincia !== 30) return false;

    const tercero = Number(ruc[2]);
    if (tercero > 6 && tercero !== 9) return false;

    return ruc.slice(10) !== '000';
}

/** Teléfono: celular 09xxxxxxxx o fijo con código de provincia 0[2-7]xxxxxxx. */
export function telefonoContactoValido(texto) {
    return /^(09\d{8}|0[2-7]\d{7})$/.test(String(texto ?? ''));
}

/** Teléfono sin espacios, guiones ni paréntesis. */
export const limpiarTelefono = texto => String(texto ?? '').replace(/[\s\-().]/g, '');

/**
 * @param {{nombre, ruc, direccion, telefono}} datos
 * @returns {Record<string, string>} { campo: problema } (vacío si está bien)
 */
export function revisarCooperativa(datos) {
    const nombre = limpiarTexto(datos.nombre);
    const direccion = limpiarTexto(datos.direccion);
    const ruc = limpiarTexto(datos.ruc);
    const telefono = limpiarTelefono(datos.telefono);
    const L = LIMITES_COOPERATIVA;
    const errores = {};

    if (nombre.length < L.nombreMinimo) errores.nombre = `Escribe el nombre de la cooperativa (mínimo ${L.nombreMinimo} caracteres).`;
    else if (nombre.length > L.nombre) errores.nombre = `Máximo ${L.nombre} caracteres.`;

    if (!ruc) errores.ruc = 'Escribe el RUC.';
    else if (!/^\d{13}$/.test(ruc)) errores.ruc = 'El RUC debe tener 13 dígitos, sin espacios ni guiones.';
    else if (!rucValido(ruc)) errores.ruc = 'El RUC no es válido. Revisa la provincia, el tercer dígito y que termine en 001 o más.';

    if (direccion.length < L.direccionMinima) errores.direccion = `Escribe la dirección (mínimo ${L.direccionMinima} caracteres).`;
    else if (direccion.length > L.direccion) errores.direccion = `Máximo ${L.direccion} caracteres.`;

    if (!telefono) errores.telefono = 'Escribe el teléfono.';
    else if (!telefonoContactoValido(telefono)) {
        errores.telefono = 'Escribe un celular (09xxxxxxxx) o un fijo con el código de provincia (02xxxxxxx).';
    }

    return errores;
}

/** Datos listos para guardar (textos limpios). */
export function cooperativaParaGuardar(datos) {
    return {
        nombre: limpiarTexto(datos.nombre),
        ruc: limpiarTexto(datos.ruc),
        direccion: limpiarTexto(datos.direccion),
        telefono: limpiarTelefono(datos.telefono)
    };
}

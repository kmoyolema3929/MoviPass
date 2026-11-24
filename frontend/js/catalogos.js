// frontend/js/catalogos.js
// Lectura de los catálogos de la aplicación (solo registros activos,
// en orden alfabético). Todavía no se usa en ninguna página.
import { supabase } from './supabaseClient.js';

// Orden alfabético en español; la opción "Otro" siempre va al final.
const esOtro = fila => String(fila.nombre).trim().toLowerCase() === 'otro';
const porNombre = (a, b) =>
    (esOtro(a) - esOtro(b)) || String(a.nombre).localeCompare(String(b.nombre), 'es');

async function leerCatalogo(tabla, columnas, filtros = {}) {
    let consulta = supabase
        .from(tabla)
        .select(columnas)
        .eq('activo', true);

    for (const [columna, valor] of Object.entries(filtros)) {
        consulta = consulta.eq(columna, valor);
    }

    const { data, error } = await consulta.order('nombre');

    if (error) throw error;

    // Se ordena también aquí para respetar tildes y eñes en español.
    return [...(data ?? [])].sort(porNombre);
}

/** @returns {Promise<{id: number, nombre: string}[]>} */
export function obtenerProvincias() {
    return leerCatalogo('provincias', 'id, nombre');
}

/**
 * Cantones activos; si se pasa una provincia, solo los de esa provincia.
 * @param {number} [provinciaId]
 * @returns {Promise<{id: number, provincia_id: number, nombre: string}[]>}
 */
export function obtenerCantones(provinciaId) {
    const filtros = provinciaId == null ? {} : { provincia_id: Number(provinciaId) };

    return leerCatalogo('cantones', 'id, provincia_id, nombre', filtros);
}

/** @returns {Promise<{id: number, nombre: string}[]>} */
export function obtenerMarcasCarroceria() {
    return leerCatalogo('marcas_carroceria', 'id, nombre');
}

/** @returns {Promise<{id: number, nombre: string}[]>} */
export function obtenerMarcasChasis() {
    return leerCatalogo('marcas_chasis', 'id, nombre');
}

/** @returns {Promise<{codigo: string, nombre: string, descuento: number}[]>} */
export function obtenerTiposPasajero() {
    return leerCatalogo('tipos_pasajero', 'codigo, nombre, descuento');
}

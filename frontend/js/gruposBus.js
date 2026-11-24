// frontend/js/gruposBus.js
// Grupos de bus de la cooperativa (cambio 6): consultas y validaciones.
// La base repite estas reglas (tabla grupos_bus y sus disparadores).

import { supabase } from './supabaseClient.js';

export const MAX_NOMBRE_GRUPO = 40;

/** Quita espacios al inicio y al final, y deja un solo espacio entre palabras. */
export function normalizarNombreGrupo(texto) {
    return String(texto ?? '').trim().replace(/\s+/g, ' ');
}

function clave(nombre) {
    return normalizarNombreGrupo(nombre).toLocaleLowerCase('es');
}

/**
 * Revisa el nombre de un grupo antes de guardarlo.
 * @param {string} nombre ya normalizado
 * @param {{id: string, nombre: string}[]} grupos los grupos de la cooperativa
 * @param {string} [idActual] el grupo que se está editando
 * @returns {string} el problema, o '' si está bien
 */
export function validarNombreGrupo(nombre, grupos = [], idActual = '') {
    if (!nombre) return 'Escribe el nombre del grupo.';

    if (nombre.length > MAX_NOMBRE_GRUPO) {
        return `El nombre admite máximo ${MAX_NOMBRE_GRUPO} caracteres.`;
    }

    const repetido = grupos.some(grupo => grupo.id !== idActual && clave(grupo.nombre) === clave(nombre));

    return repetido ? 'Ya tienes un grupo con ese nombre.' : '';
}

/** "Sin buses", "1 bus", "3 buses". */
export function textoBuses(cantidad) {
    if (!cantidad) return 'Sin buses';
    return cantidad === 1 ? '1 bus' : `${cantidad} buses`;
}

/** Mensaje claro para los errores de la base. */
export function mensajeErrorGrupo(error, accion = 'guardar') {
    switch (error?.code) {
        case '23505':
            // Nombre repetido, o una plantilla de asientos ya usa ese nombre.
            return /plantilla/i.test(error.message ?? '')
                ? error.message
                : 'Ya tienes un grupo con ese nombre.';

        case '23503':
            // Grupo con buses (o frecuencias): el mensaje de la base dice cuántos.
            return error.message || 'El grupo está en uso y no se puede eliminar.';

        case '23514':
        case '22001':
            return `Revisa el nombre del grupo (máximo ${MAX_NOMBRE_GRUPO} caracteres).`;

        case '42501':
            return 'No tienes permisos para realizar esta operación.';

        case 'PGRST116':
            return 'El grupo ya no está disponible. Recarga la página.';

        default:
            return `No se pudo ${accion} el grupo. Revisa tu conexión e inténtalo nuevamente.`;
    }
}

/** Grupos de una cooperativa con la cantidad de buses de cada uno, por nombre. */
export async function obtenerGruposBus(cooperativaId) {
    const { data, error } = await supabase
        .from('grupos_bus')
        .select('id, nombre, buses(count)')
        .eq('cooperativa_id', cooperativaId)
        .order('nombre');

    if (error) throw error;

    return (data ?? [])
        .map(grupo => ({
            id: grupo.id,
            nombre: grupo.nombre,
            buses: grupo.buses?.[0]?.count ?? 0
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

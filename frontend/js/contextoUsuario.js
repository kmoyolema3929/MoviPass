// frontend/js/contextoUsuario.js
// Datos del usuario que usan las pantallas de gestión: su rol y las
// cooperativas que puede administrar.
//  - administrador: todas las cooperativas.
//  - cooperativa y oficinista: solo las que tienen asignadas en cooperativas_usuarios.

import { supabase } from './supabaseClient.js';
import { obtenerSesion, obtenerRol } from './auth.js';

/**
 * @returns {Promise<{rol: string, cooperativas: {id: string, nombre: string}[]}>}
 */
export async function obtenerContextoGestion() {
    const sesion = await obtenerSesion();
    const rol = await obtenerRol();
    let cooperativas = [];

    if (rol === 'administrador') {
        const { data, error } = await supabase
            .from('cooperativas')
            .select('id, nombre')
            .order('nombre', { ascending: true });

        if (error) throw error;
        cooperativas = data ?? [];
    } else if (['cooperativa', 'oficinista'].includes(rol) && sesion) {
        const { data, error } = await supabase
            .from('cooperativas_usuarios')
            .select('cooperativas ( id, nombre )')
            .eq('perfil_id', sesion.user.id);

        if (error) throw error;

        cooperativas = (data ?? [])
            .map((fila) => fila.cooperativas)
            .filter(Boolean)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }

    return { rol, cooperativas };
}

/** Mensaje claro para los errores más comunes de Supabase / Postgres. */
export function textoError(error) {
    const msg = error?.message ?? '';

    switch (error?.code) {
        case '23505':
            if (msg.includes('bus_fecha')) return 'Ese bus ya está asignado a otra frecuencia en esa fecha.';
            if (msg.includes('frecuencia_fecha')) return 'Esa frecuencia ya tiene un bus asignado en esa fecha.';
            return 'Ya existe un registro con esos datos.';
        case '23503':
            return 'No se puede eliminar porque tiene registros relacionados (por ejemplo hojas de ruta o boletos vendidos).';
        case '23514':
            // Los mensajes de las validaciones de la base de datos ya están en español
            return msg.includes('check constraint')
                ? 'Alguno de los datos no cumple las reglas del sistema.'
                : msg;
        case '42501':
            return 'Tu cuenta no tiene permiso para realizar esta operación.';
        default:
            return 'No se pudo completar la operación. ' + msg;
    }
}
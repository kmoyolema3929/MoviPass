// frontend/js/cuentasPersonal.js
// Crear la cuenta de una persona del personal (oficinista o usuario bus) con
// el mismo mecanismo de siempre: signUp crea la cuenta (con rol cliente), se
// restaura la sesión del gerente y asignar_usuario_a_cooperativa le da el
// rol y la enlaza a la cooperativa.

import { supabase } from './supabaseClient.js';
import { limpiar } from './personal.js';

/**
 * @param {object} p
 * @param {{email, password, cedula, nombres, apellidos, telefono}} p.datos
 * @param {string} p.cooperativaId
 * @param {'oficinista'|'bus'} p.rol
 * @param {string} [p.ubicacion]  ubicación de la oficina (oficinista)
 * @param {string} [p.funcion]    chofer, controlador o dueno (usuario bus)
 */
export async function crearCuentaPersonal({ datos, cooperativaId, rol, ubicacion = null, funcion = null }) {
    const { data: { session: sesionGerente } } = await supabase.auth.getSession();

    if (!sesionGerente) throw new Error('No hay una sesión activa.');

    try {
        const { data, error } = await supabase.auth.signUp({
            email: limpiar(datos.email).toLowerCase(),
            password: datos.password,
            options: {
                data: {
                    cedula: limpiar(datos.cedula),
                    nombres: limpiar(datos.nombres),
                    apellidos: limpiar(datos.apellidos),
                    telefono: limpiar(datos.telefono) || null
                }
            }
        });

        if (error) throw error;
        if (!data.user) throw new Error('No se pudo crear el usuario.');

        // Con confirmación por correo, un correo repetido no da error: llega sin "identities".
        if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            throw new Error('User already registered');
        }

        // Restaurar la sesión del gerente para no perder permisos.
        await supabase.auth.setSession(sesionGerente);
        await new Promise(listo => setTimeout(listo, 1500));

        const { error: errorAsignar } = await supabase.rpc('asignar_usuario_a_cooperativa', {
            p_usuario_id: data.user.id,
            p_cooperativa_id: cooperativaId,
            p_rol: rol,
            p_ubicacion_oficina: ubicacion,
            p_funcion_bus: funcion
        });

        if (errorAsignar) throw errorAsignar;
    } catch (error) {
        try {
            await supabase.auth.setSession(sesionGerente);
        } catch (errorSesion) {
            console.error('No se pudo restaurar la sesión del gerente:', errorSesion);
        }
        throw error;
    }
}

/** Cooperativa del gerente con sesión iniciada (null si no tiene). */
export async function obtenerMiCooperativa() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const { data, error } = await supabase
        .from('cooperativas_usuarios')
        .select('cooperativa_id')
        .eq('perfil_id', session.user.id)
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data?.cooperativa_id ?? null;
}

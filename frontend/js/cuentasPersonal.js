// frontend/js/cuentasPersonal.js
// Cuentas del personal (oficinista, usuario bus o gerente):
//  - crearCuentaPersonal: signUp crea la cuenta (con rol cliente), se
//    restaura la sesión del gerente o administrador y
//    asignar_usuario_a_cooperativa le da el rol y la enlaza a la cooperativa.
//    Con "Confirm email" activado, signUp no devuelve sesión y la persona
//    recibe el código de 6 dígitos; lo escribe la primera vez que entra.
//  - asignarCuentaExistente: asigna una cuenta de cliente ya creada
//    (cédula y correo deben coincidir; la base lo revisa).

import { supabase } from './supabaseClient.js';
import { limpiar } from './personal.js';
import { datosDeSignUp, limpiarCorreo } from './reglasCuenta.js';

/** Error con el código y el mensaje que muestra mensajeErrorPersonal(). */
function errorDeDatos(mensaje, codigo = '23505') {
    return Object.assign(new Error(mensaje), { code: codigo });
}

/** Vuelve a la sesión del gerente o administrador si signUp la cambió. */
async function restaurarSesion(sesionGestor) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id === sesionGestor.user.id) return;

    const { error } = await supabase.auth.setSession({
        access_token: sesionGestor.access_token,
        refresh_token: sesionGestor.refresh_token
    });
    if (error) throw error;
}

/**
 * @param {object} p
 * @param {{email, password, cedula, nombres, apellidos, telefono, fecha_nacimiento}} p.datos
 * @param {string} p.cooperativaId
 * @param {'oficinista'|'bus'|'cooperativa'} p.rol
 * @param {string} [p.ubicacion]  ubicación de la oficina (oficinista)
 * @param {string} [p.funcion]    chofer, controlador o dueno (usuario bus)
 */
export async function crearCuentaPersonal({ datos, cooperativaId, rol, ubicacion = null, funcion = null }) {
    const { data: { session: sesionGestor } } = await supabase.auth.getSession();

    if (!sesionGestor) throw new Error('No hay una sesión activa.');

    // Antes de crear la cuenta: si la cédula ya existe, signUp solo diría "Database error".
    const { data: repetida, error: errorCedula } = await supabase.rpc('cedula_registrada', {
        p_cedula: limpiar(datos.cedula)
    });
    if (errorCedula) throw errorCedula;
    if (repetida) {
        throw errorDeDatos('Ya existe una cuenta con esta cédula. Si es de un cliente, usa "Asignar una cuenta existente".');
    }

    try {
        const { data, error } = await supabase.auth.signUp({
            email: limpiarCorreo(datos.email),
            password: datos.password,
            options: { data: datosDeSignUp(datos, 'personal') }
        });

        if (error) throw error;
        if (!data.user) throw new Error('No se pudo crear el usuario.');

        // Con confirmación por correo, un correo repetido no da error: llega sin "identities".
        if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            throw new Error('User already registered');
        }

        // Sin "Confirm email" (o en versiones antiguas de supabase-js), signUp
        // cambia la sesión: se restaura la del gerente o administrador antes
        // de asignar el rol. (El perfil ya existe: lo crea el disparador.)
        await restaurarSesion(sesionGestor);

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
            await restaurarSesion(sesionGestor);
        } catch (errorSesion) {
            console.error('No se pudo restaurar la sesión del gerente:', errorSesion);
        }
        throw error;
    }
}

/**
 * Asigna a la cooperativa una cuenta de cliente que ya existe.
 * @param {object} p
 * @param {string} p.cedula
 * @param {string} p.email
 * @param {string} p.cooperativaId
 * @param {'oficinista'|'bus'} p.rol
 * @param {string} [p.ubicacion]
 * @param {string} [p.funcion]
 */
export async function asignarCuentaExistente({ cedula, email, cooperativaId, rol, ubicacion = null, funcion = null }) {
    const { error } = await supabase.rpc('asignar_cuenta_existente', {
        p_cedula: limpiar(cedula),
        p_correo: limpiarCorreo(email),
        p_cooperativa_id: cooperativaId,
        p_rol: rol,
        p_ubicacion_oficina: ubicacion,
        p_funcion_bus: funcion
    });

    if (error) throw error;
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

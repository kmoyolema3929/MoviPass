// frontend/js/auth.js
// Funciones comunes de autenticación.

import { supabase } from './supabaseClient.js';

// Ruta de login calculada desde este módulo (frontend/js/auth.js), para que
// funcione igual desde el index raíz y desde cualquier carpeta de pages/.
const RUTA_LOGIN = new URL('../pages/login.html', import.meta.url).href;

/**
 * Obtiene la sesión actual del usuario.
 * @returns {Promise<Session | null>} La sesión o null si no hay usuario autenticado.
 */
export async function obtenerSesion() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * Obtiene el rol del usuario autenticado desde la tabla `perfiles`.
 * Depende de que la migración del Issue #7 esté aplicada.
 * @returns {Promise<string | null>} El rol del usuario o null si no hay sesión.
 */
export async function obtenerRol() {
  const sesion = await obtenerSesion();
  if (!sesion) return null;

  const { data, error } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', sesion.user.id)
    .single();

  if (error) throw error;
  return data?.rol ?? null;
}

/**
 * Cierra la sesión del usuario actual y redirige.
 *
 * Se intenta cerrar la sesión en el servidor; si falla (por ejemplo, por falta
 * de conexión), se borra la sesión local para que el usuario no quede atrapado
 * con la cuenta abierta en este navegador. Al final siempre se redirige con
 * replace(): así el botón "atrás" no vuelve a la página autenticada.
 *
 * @param {string} [redireccion] Ruta a la que redirigir (por defecto, el login).
 */
export async function cerrarSesion(redireccion = RUTA_LOGIN) {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('No se pudo cerrar la sesión en el servidor:', error);

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (errorLocal) {
      console.error('Tampoco se pudo borrar la sesión local:', errorLocal);
    }
  }

  // Comprobación final: si por cualquier motivo la sesión sigue guardada en
  // este navegador, se elimina también de forma local antes de salir.
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      await supabase.auth.signOut({ scope: 'local' });
    }
  } catch (errorFinal) {
    console.error('No se pudo confirmar el cierre de sesión:', errorFinal);
  }

  // replace() evita que el botón "atrás" vuelva a una página autenticada.
  window.location.replace(redireccion);
}

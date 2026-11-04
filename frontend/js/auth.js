// frontend/js/auth.js
// Funciones comunes de autenticación.

import { supabase } from './supabaseClient.js';

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
 * Si el servidor no responde, igual se borra la sesión local para que el
 * usuario no quede "atrapado" con la sesión abierta en este navegador.
 * @param {string} [redireccion='/pages/login.html'] Ruta a la que redirigir.
 */
export async function cerrarSesion(redireccion = '/pages/login.html') {
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
  } finally {
    // replace() evita que el botón "atrás" vuelva a una página autenticada.
    window.location.replace(redireccion);
  }
}
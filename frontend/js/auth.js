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
 * Cierra la sesión del usuario actual y redirige al login.
 * @param {string} [redireccion='/pages/login.html'] Ruta a la que redirigir.
 */
export async function cerrarSesion(redireccion = '/pages/login.html') {
  await supabase.auth.signOut();
  window.location.href = redireccion;
}
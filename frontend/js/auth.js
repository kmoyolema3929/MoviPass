// frontend/js/auth.js
// Funciones comunes de autenticación.

import { supabase } from './supabaseClient.js';
import { pendientesDelPerfil } from './reglasCuenta.js';

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

/** Panel de cada rol (rutas absolutas, válidas desde cualquier página). */
export const PANEL_POR_ROL = {
  administrador: new URL('../pages/administrador/index.html', import.meta.url).href,
  cooperativa: new URL('../pages/cooperativa/index.html', import.meta.url).href,
  oficinista: new URL('../pages/oficinista/index.html', import.meta.url).href,
  cliente: new URL('../pages/cliente/index.html', import.meta.url).href,
  // Cambio 4: el usuario bus entra a su app (pages/bus/buses.html es del gerente).
  bus: new URL('../pages/usuario-bus/index.html', import.meta.url).href
};

export const RUTA_PERFIL = new URL('../pages/perfil.html', import.meta.url).href;

const COLUMNAS_PERFIL = 'id, rol, estado, cedula, nombres, apellidos, telefono, fecha_nacimiento';

/**
 * Perfil del usuario con sesión (solo su propia fila), o null si no hay sesión.
 * Si la base todavía no tiene la columna fecha_nacimiento (migración del
 * cambio 3 sin aplicar), se lee sin ella para no dejar a nadie fuera.
 * @returns {Promise<{id, rol, estado, cedula, nombres, apellidos, telefono, fecha_nacimiento?} | null>}
 */
export async function obtenerPerfilPropio() {
  const sesion = await obtenerSesion();
  if (!sesion) return null;

  const leer = columnas => supabase
    .from('perfiles')
    .select(columnas)
    .eq('id', sesion.user.id)
    .maybeSingle();

  let { data, error } = await leer(COLUMNAS_PERFIL);

  if (error && (error.code === '42703' || /fecha_nacimiento/.test(error.message ?? ''))) {
    ({ data, error } = await leer('id, rol, estado, cedula, nombres, apellidos, telefono'));
  }

  if (error) throw error;
  return data ? { ...data, correo: sesion.user.email ?? '' } : null;
}

/**
 * A dónde ir después de iniciar sesión o verificar el correo.
 * @param {object|null} perfil  Resultado de obtenerPerfilPropio().
 * @returns {{destino: string|null, problema: 'sin-perfil'|'suspendida'|'sin-rol'|null}}
 */
export function destinoDelPerfil(perfil) {
  if (!perfil) return { destino: null, problema: 'sin-perfil' };
  if (perfil.estado === 'suspendido') return { destino: null, problema: 'suspendida' };
  if (!PANEL_POR_ROL[perfil.rol]) return { destino: null, problema: 'sin-rol' };

  if (pendientesDelPerfil(perfil).length > 0) {
    const url = new URL(RUTA_PERFIL);
    url.searchParams.set('completar', '1');
    return { destino: url.href, problema: null };
  }

  return { destino: PANEL_POR_ROL[perfil.rol], problema: null };
}

/** Mensajes para los problemas de destinoDelPerfil(). */
export const MENSAJES_ACCESO = {
  'sin-perfil': 'No se encontró el perfil de tu cuenta. Contacta al administrador.',
  suspendida: 'Tu cuenta está suspendida. Comunícate con tu cooperativa o con el administrador de MoviPass.',
  'sin-rol': 'Tu cuenta no tiene un rol asignado. Contacta al administrador.'
};

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

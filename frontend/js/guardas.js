// frontend/js/guardas.js
// Guardas de rol para proteger páginas.

import { obtenerSesion, obtenerRol } from './auth.js';

/**
 * Exige que el usuario tenga uno de los roles permitidos.
 * Si no hay sesión, redirige al login.
 * Si el rol no está permitido, redirige a sin-acceso.
 * @param {string[]} rolesPermitidos Lista de roles que pueden ver la página.
 * @param {string} [rutaLogin='/pages/login.html'] Ruta al login.
 * @param {string} [rutaSinAcceso='/pages/sin-acceso.html'] Ruta para sin acceso.
 */
export async function exigirRoles(
  rolesPermitidos,
  rutaLogin = '/pages/login.html',
  rutaSinAcceso = '/pages/sin-acceso.html'
) {
  const sesion = await obtenerSesion();

  if (!sesion) {
    window.location.href = rutaLogin;
    return;
  }

  const rol = await obtenerRol();

  if (!rol || !rolesPermitidos.includes(rol)) {
    window.location.href = rutaSinAcceso;
  }
}
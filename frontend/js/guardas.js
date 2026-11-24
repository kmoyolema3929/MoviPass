// frontend/js/guardas.js
// Guardas de rol para proteger páginas.
//
// IMPORTANTE: esto solo controla qué ve el usuario en pantalla. La seguridad real
// está en las políticas RLS de Supabase; aunque alguien salte este archivo, la base
// de datos rechaza lo que su rol no puede hacer.

import { obtenerSesion, obtenerRol, cerrarSesion as cerrarSesionAuth } from './auth.js';

// Las rutas se calculan desde la ubicación de ESTE archivo (frontend/js/guardas.js),
// así funcionan desde cualquier carpeta de pages/ sin escribir ../ a mano.
const RUTA_LOGIN = new URL('../pages/login.html', import.meta.url).href;
const RUTA_SIN_ACCESO = new URL('../pages/sin-acceso.html', import.meta.url).href;
const RUTA_INICIO = new URL('../index.html', import.meta.url).href;

// Ocultar la página desde que se carga este módulo. Así no se alcanza a ver
// contenido protegido mientras se comprueba la sesión de forma asíncrona.
document.documentElement.style.visibility = 'hidden';

// Al abandonar la página se guarda oculta en la caché del navegador (bfcache).
// Si el usuario vuelve con "atrás", primero se revalida la sesión y solo
// después se muestra el contenido.
window.addEventListener('pagehide', () => {
    document.documentElement.style.visibility = 'hidden';
});

/**
 * Añade a la ruta del login la página actual, para volver a ella después de
 * iniciar sesión (por ejemplo: buscar viaje sin sesión -> seleccionar asientos).
 */
function rutaLoginConRetorno(rutaLogin) {
    try {
        const url = new URL(rutaLogin);
        url.searchParams.set(
            'redirect',
            window.location.pathname + window.location.search + window.location.hash
        );
        return url.href;
    } catch {
        return rutaLogin;
    }
}

/**
 * Comprueba sesión y rol. Devuelve el rol si tiene acceso, o null tras redirigir.
 */
async function verificarAcceso(rolesPermitidos, rutaLogin, rutaSinAcceso) {
    try {
        const sesion = await obtenerSesion();

        if (!sesion) {
            window.location.replace(rutaLoginConRetorno(rutaLogin));
            return null;
        }

        const rol = await obtenerRol();

        if (!rol || !rolesPermitidos.includes(rol)) {
            window.location.replace(rutaSinAcceso);
            return null;
        }

        document.documentElement.style.visibility = '';
        return rol;
    } catch (error) {
        console.error('No se pudo verificar el acceso:', error);
        window.location.replace(rutaLoginConRetorno(rutaLogin));
        return null;
    }
}

/**
 * Exige que el usuario tenga uno de los roles permitidos.
 * Mientras se comprueba, la página permanece oculta (así no se ve un instante
 * contenido al que no se tiene acceso).
 * - Sin sesión o con error: redirige al login.
 * - Con un rol no permitido: redirige a sin-acceso.
 * - Se vuelve a comprobar al regresar con el botón "atrás", al restaurar la
 *   página desde la caché del navegador (bfcache), al cambiar de pestaña y
 *   cuando otra pestaña cierra la sesión. Así, después de cerrar sesión el
 *   botón "atrás" no muestra una copia autenticada de la página.
 * @param {string[]} rolesPermitidos Roles que pueden ver la página.
 * @returns {Promise<string|null>} El rol del usuario, o null si fue redirigido.
 */
export async function exigirRoles(
    rolesPermitidos,
    rutaLogin = RUTA_LOGIN,
    rutaSinAcceso = RUTA_SIN_ACCESO
) {
    document.documentElement.style.visibility = 'hidden';

    let comprobando = false;
    let accesoDenegado = false;

    async function revalidar() {
        if (comprobando || accesoDenegado) return;

        comprobando = true;
        document.documentElement.style.visibility = 'hidden';

        try {
            const rol = await verificarAcceso(
                rolesPermitidos,
                rutaLogin,
                rutaSinAcceso
            );

            if (!rol) accesoDenegado = true;
        } finally {
            comprobando = false;
        }
    }

    // Al volver con "atrás" o al restaurar la página desde bfcache, el navegador
    // puede mostrarla sin volver a ejecutar los scripts. En ese caso se repite
    // la comprobación antes de dejar ver el contenido.
    window.addEventListener('pageshow', (evento) => {
        const oculta = document.documentElement.style.visibility === 'hidden';
        if (evento.persisted || oculta) void revalidar();
    });

    // Algunos navegadores restauran el historial sin marcar persisted.
    window.addEventListener('popstate', () => {
        void revalidar();
    });

    // Al recuperar el foco de la pestaña, por si la sesión se cerró mientras
    // estaba en segundo plano.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void revalidar();
    });

    // Si otra pestaña cierra la sesión, Supabase actualiza el almacenamiento
    // local y este evento permite reaccionar en las demás pestañas abiertas.
    window.addEventListener('storage', (evento) => {
        if (!evento.key || !evento.key.includes('-auth-token')) return;
        if (evento.newValue === null) void revalidar();
    });

    const rol = await verificarAcceso(rolesPermitidos, rutaLogin, rutaSinAcceso);
    if (!rol) accesoDenegado = true;

    return rol;
}

/** Cierra la sesión y vuelve a la página principal. */
export function cerrarSesion(redireccion = RUTA_INICIO) {
    return cerrarSesionAuth(redireccion);
}

// Cualquier botón con id="btnCerrarSesion" cierra la sesión.
// Se comprueba readyState porque este módulo también puede cargarse después
// de DOMContentLoaded (por ejemplo, desde una guarda asíncrona).
function conectarBotonCerrarSesion() {
    const btnCerrarSesion = document.getElementById('btnCerrarSesion');
    if (!btnCerrarSesion || btnCerrarSesion.dataset.cerrarSesionListo === 'true') {
        return;
    }

    btnCerrarSesion.dataset.cerrarSesionListo = 'true';
    btnCerrarSesion.addEventListener('click', () => {
        btnCerrarSesion.disabled = true;
        void cerrarSesion();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', conectarBotonCerrarSesion);
} else {
    conectarBotonCerrarSesion();
}

import { mostrarAlerta } from './alertas.js';
import { supabase } from './supabaseClient.js';
import { obtenerRol } from './auth.js';

// Panel de cada rol (rutas relativas a /pages/login.html)
const PANEL_POR_ROL = {
    administrador: 'administrador/index.html',
    cooperativa: 'cooperativa/index.html',
    oficinista: 'oficinista/index.html',
    cliente: 'cliente/index.html',
    bus: 'bus/buses.html'
};

/**
 * Redirige al panel del rol. Devuelve false si el rol no tiene panel.
 */
function irAlPanel(rol) {
    const destino = PANEL_POR_ROL[rol];
    if (!destino) return false;
    window.location.href = destino;
    return true;
}

/**
 * Destino al que volver tras el login (lo envía guardas.js cuando alguien
 * intenta abrir una página sin sesión). Solo se acepta una ruta del mismo
 * sitio dentro de /pages/, para evitar redirecciones externas.
 */
function obtenerRetorno() {
    const valor = new URLSearchParams(window.location.search).get('redirect');
    if (!valor) return null;

    try {
        const url = new URL(valor, window.location.href);
        if (url.origin !== window.location.origin) return null;
        if (!url.pathname.includes('/pages/')) return null;
        return url.href;
    } catch {
        return null;
    }
}

/**
 * Después de iniciar sesión: vuelve a la página pedida si el usuario es
 * cliente; en los demás casos se abre su panel habitual.
 */
function irAlDestino(rol) {
    const retorno = obtenerRetorno();

    if (rol === 'cliente' && retorno) {
        window.location.replace(retorno);
        return true;
    }

    return irAlPanel(rol);
}

// Si ya hay una sesión activa, se envía directo a su panel
async function verificarSesion() {
    try {
        const rol = await obtenerRol(); // null si no hay sesión
        if (rol) {
            irAlDestino(rol);
        }
    } catch (error) {
        console.error('No se pudo verificar la sesión:', error);
    }
}

// Solo ejecutamos la verificación si NO estamos en la página de login manual
// (Para evitar que un admin logueado sea redirigido antes de hacer clic)
if (document.getElementById('formLogin')) {
    verificarSesion();
}

const formLogin = document.getElementById('formLogin');

if (formLogin) {
    const btnLogin = document.getElementById('btnLogin');
    const textoOriginal = btnLogin.textContent;

    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();

        // El correo se limpia y se pasa a minúsculas; la contraseña NO se modifica
        const email = document.getElementById('emailInput').value.trim().toLowerCase();
        const password = document.getElementById('passwordInput').value;

        btnLogin.textContent = 'Iniciando sesión...';
        btnLogin.disabled = true;
        let redirigiendo = false;

        try {
            // 1. Iniciar sesión con correo y contraseña
            const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

            if (authError) {
                if (authError.message.includes('Email not confirmed')) {
                    mostrarAlerta('Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.', 'warning');
                } else {
                    mostrarAlerta('Correo o contraseña incorrectos. Inténtalo de nuevo.', 'danger');
                }
                return;
            }

            // 2. Buscar el rol del usuario en la tabla perfiles
            const rol = await obtenerRol();

            if (!rol || !PANEL_POR_ROL[rol]) {
                // Sin rol válido no se deja la sesión abierta
                await supabase.auth.signOut();
                mostrarAlerta('Tu cuenta no tiene un rol asignado. Contacta al administrador.', 'danger');
                return;
            }

            // 3. Redirigir según el rol (o a la página que se quería abrir)
            redirigiendo = irAlDestino(rol);
        } catch (error) {
            console.error('Error inesperado al iniciar sesión:', error);
            mostrarAlerta('No se pudo iniciar sesión. Revisa tu conexión e inténtalo de nuevo.', 'danger');
        } finally {
            // Si se está redirigiendo, el botón queda bloqueado para evitar doble clic
            if (!redirigiendo) {
                btnLogin.textContent = textoOriginal;
                btnLogin.disabled = false;
            }
        }
    });

    // Mostrar / ocultar contraseña
    const btnTogglePass = document.getElementById('btnTogglePass');
    const passwordInput = document.getElementById('passwordInput');

    if (btnTogglePass && passwordInput) {
        btnTogglePass.addEventListener('click', () => {
            const visible = passwordInput.type === 'text';
            passwordInput.type = visible ? 'password' : 'text';
            btnTogglePass.textContent = visible ? '👁️' : '🙈';
            btnTogglePass.setAttribute('aria-pressed', String(!visible));
        });
    }
}
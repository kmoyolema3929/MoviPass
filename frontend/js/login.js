// frontend/js/login.js
// Inicio de sesión (cambio 3, parte 3.1): mensajes claros (correo o
// contraseña incorrectos, cuenta sin verificar, cuenta suspendida) y
// envío a "Mi perfil" si la cuenta tiene datos por corregir.

import { mostrarAlerta } from './alertas.js';
import { supabase } from './supabaseClient.js';
import { MENSAJES_ACCESO, destinoDelPerfil, obtenerPerfilPropio } from './auth.js';
import { limpiarCorreo, mensajeErrorAuth, revisarCorreo } from './reglasCuenta.js';
import { conBotonOcupado, limpiarAlEscribir, mostrarErrores } from './formularios.js';

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
 * cliente con el perfil completo; en los demás casos se abre su panel
 * (o "Mi perfil" si tiene datos por corregir).
 * @returns {string|null} problema (ver MENSAJES_ACCESO) o null si redirige.
 */
function irAlDestino(perfil) {
    const { destino, problema } = destinoDelPerfil(perfil);
    if (problema) return problema;

    const retorno = obtenerRetorno();
    const completo = !destino.includes('completar=1');

    window.location.replace(perfil.rol === 'cliente' && completo && retorno ? retorno : destino);
    return null;
}

// Avisos que llegan en la dirección (?motivo=...).
const AVISOS = {
    suspendida: [MENSAJES_ACCESO.suspendida, 'danger'],
    'clave-cambiada': ['Tu contraseña se cambió. Inicia sesión con la contraseña nueva.', 'success']
};

const formLogin = document.getElementById('formLogin');

if (formLogin) {
    const btnLogin = document.getElementById('btnLogin');
    const campoEmail = document.getElementById('emailInput');
    const campoPassword = document.getElementById('passwordInput');
    const avisoVerificar = document.getElementById('avisoVerificar');
    const enlaceVerificar = document.getElementById('enlaceVerificar');

    const aviso = AVISOS[new URLSearchParams(window.location.search).get('motivo')];
    if (aviso) mostrarAlerta(...aviso);

    // Si ya hay una sesión activa, se envía directo a su panel.
    (async () => {
        try {
            const perfil = await obtenerPerfilPropio(); // null si no hay sesión
            if (perfil && destinoDelPerfil(perfil).problema === 'suspendida') {
                await supabase.auth.signOut({ scope: 'local' });
                return;
            }
            if (perfil) irAlDestino(perfil);
        } catch (error) {
            console.error('No se pudo verificar la sesión:', error);
        }
    })();

    limpiarAlEscribir(formLogin);

    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        avisoVerificar.classList.add('d-none');

        // El correo se limpia y se pasa a minúsculas; la contraseña NO se modifica.
        const email = limpiarCorreo(campoEmail.value);
        const password = campoPassword.value;

        const errores = {
            email: revisarCorreo(email),
            password: password ? '' : 'Escribe tu contraseña.'
        };
        if (!mostrarErrores(formLogin, errores)) return;

        await conBotonOcupado(btnLogin, 'Iniciando sesión...', async () => {
            try {
                const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

                if (authError) {
                    const sinVerificar = authError.code === 'email_not_confirmed'
                        || /email not confirmed/i.test(authError.message ?? '');

                    if (sinVerificar) {
                        enlaceVerificar.href = `verificar-correo.html?correo=${encodeURIComponent(email)}`;
                        avisoVerificar.classList.remove('d-none');
                    } else {
                        mostrarAlerta(mensajeErrorAuth(authError), 'danger');
                    }
                    return false;
                }

                const perfil = await obtenerPerfilPropio();
                const problema = irAlDestino(perfil);

                if (problema) {
                    // Sin rol o suspendida: no se deja la sesión abierta.
                    await supabase.auth.signOut({ scope: 'local' });
                    mostrarAlerta(MENSAJES_ACCESO[problema], 'danger');
                    return false;
                }

                return true; // redirigiendo: el botón queda bloqueado
            } catch (error) {
                console.error('Error inesperado al iniciar sesión:', error);
                mostrarAlerta(mensajeErrorAuth(error), 'danger');
                return false;
            }
        });
    });

    // Mostrar / ocultar contraseña
    const btnTogglePass = document.getElementById('btnTogglePass');

    if (btnTogglePass && campoPassword) {
        btnTogglePass.addEventListener('click', () => {
            const visible = campoPassword.type === 'text';
            campoPassword.type = visible ? 'password' : 'text';
            btnTogglePass.textContent = visible ? '👁️' : '🙈';
            btnTogglePass.setAttribute('aria-pressed', String(!visible));
        });
    }
}

// frontend/js/nuevaContrasena.js
// Página a la que lleva el enlace del correo "Reset Password". supabase-js
// lee el enlace (detectSessionInUrl) y abre una sesión de recuperación; con
// ella se guarda la contraseña nueva, se cierra la sesión y se vuelve al login.

import { mostrarAlerta } from './alertas.js';
import { supabase } from './supabaseClient.js';
import { mensajeErrorAuth, revisarNuevaPassword } from './reglasCuenta.js';
import { conBotonOcupado, limpiarAlEscribir, mostrarErrores } from './formularios.js';

const form = document.getElementById('formNueva');
const btnGuardar = document.getElementById('btnGuardar');
const campoPassword = document.getElementById('passwordInput');
const campoConfirmacion = document.getElementById('confirmacionInput');
const RUTA_LOGIN = new URL('login.html?motivo=clave-cambiada', window.location.href).href;

function mostrar(id, visible) {
    document.getElementById(id).classList.toggle('d-none', !visible);
}

// Supabase devuelve el error del enlace en la dirección (#error=...&error_code=otp_expired).
function errorEnLaDireccion() {
    const datos = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    return datos.get('error_code') || datos.get('error');
}

async function iniciar() {
    if (errorEnLaDireccion()) {
        mostrar('cargando', false);
        mostrar('enlaceInvalido', true);
        return;
    }

    try {
        // getSession espera a que supabase-js termine de leer el enlace.
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        mostrar('cargando', false);

        if (!data.session) {
            mostrar('enlaceInvalido', true);
            return;
        }

        // Quita los datos del enlace de la barra de direcciones.
        history.replaceState(null, '', window.location.pathname);
        mostrar('formNueva', true);
        campoPassword.focus();
    } catch (error) {
        console.error('No se pudo leer el enlace:', error);
        mostrar('cargando', false);
        mostrarAlerta(mensajeErrorAuth(error), 'danger');
        mostrar('enlaceInvalido', true);
    }
}

limpiarAlEscribir(form);

form.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const password = campoPassword.value;
    if (!mostrarErrores(form, revisarNuevaPassword(password, campoConfirmacion.value))) return;

    await conBotonOcupado(btnGuardar, 'Guardando...', async () => {
        try {
            const { error } = await supabase.auth.updateUser({ password });

            if (error) {
                mostrarErrores(form, { password: mensajeErrorAuth(error) });
                return false;
            }

            await supabase.auth.signOut({ scope: 'local' });
            window.location.replace(RUTA_LOGIN);
            return true;
        } catch (error) {
            console.error('No se pudo cambiar la contraseña:', error);
            mostrarAlerta(mensajeErrorAuth(error), 'danger');
            return false;
        }
    });
});

void iniciar();

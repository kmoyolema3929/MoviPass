// frontend/js/recuperarContrasena.js
// Pide el correo y Supabase envía el enlace (plantilla "Reset Password").
// El enlace abre nueva-contrasena.html, que debe estar en las direcciones de
// redirección permitidas de Supabase (Authentication -> URL Configuration).

import { mostrarAlerta } from './alertas.js';
import { supabase } from './supabaseClient.js';
import { esErrorDeConexion, limpiarCorreo, mensajeErrorAuth, revisarCorreo } from './reglasCuenta.js';
import { conBotonOcupado, limpiarAlEscribir, mostrarErrores } from './formularios.js';

const form = document.getElementById('formRecuperar');
const campoCorreo = document.getElementById('correoInput');
const btnEnviar = document.getElementById('btnEnviar');
const RUTA_NUEVA = new URL('nueva-contrasena.html', window.location.href).href;

limpiarAlEscribir(form);

form.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const correo = limpiarCorreo(campoCorreo.value);
    if (!mostrarErrores(form, { correo: revisarCorreo(correo) })) return;

    await conBotonOcupado(btnEnviar, 'Enviando...', async () => {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(correo, { redirectTo: RUTA_NUEVA });

            // Por seguridad no se dice si el correo existe: solo se avisan
            // los problemas de conexión y de demasiados intentos.
            if (error && (esErrorDeConexion(error) || /rate limit|too many|security purposes/i.test(`${error.code} ${error.message}`))) {
                mostrarAlerta(mensajeErrorAuth(error), 'danger');
                return false;
            }
            if (error) console.error('Recuperar contraseña:', error);

            form.classList.add('d-none');
            document.getElementById('enviado').classList.remove('d-none');
            return true;
        } catch (error) {
            console.error('No se pudo enviar el enlace:', error);
            mostrarAlerta(mensajeErrorAuth(error), 'danger');
            return false;
        }
    });
});

// frontend/js/verificarCorreo.js
// Activar la cuenta con el código de 6 dígitos que envía Supabase Auth
// (plantilla "Confirm signup" con {{ .Token }}). Lo usan el cliente que se
// acaba de registrar y el personal la primera vez que entra.

import { mostrarAlerta } from './alertas.js';
import { supabase } from './supabaseClient.js';
import { MENSAJES_ACCESO, destinoDelPerfil, obtenerPerfilPropio } from './auth.js';
import { limpiarCorreo, mensajeErrorAuth, revisarCodigo, revisarCorreo } from './reglasCuenta.js';
import { conBotonOcupado, limpiarAlEscribir, mostrarErrores, soloDigitos } from './formularios.js';

const form = document.getElementById('formVerificar');
const campoCorreo = document.getElementById('correoInput');
const campoCodigo = document.getElementById('codigoInput');
const btnVerificar = document.getElementById('btnVerificar');
const btnReenviar = document.getElementById('btnReenviar');
const ESPERA_REENVIO = 60; // segundos entre reenvíos

const parametros = new URLSearchParams(window.location.search);
let correoGuardado = '';
try {
    correoGuardado = sessionStorage.getItem('movipass-correo-verificar') ?? '';
} catch { /* sin almacenamiento */ }

campoCorreo.value = limpiarCorreo(parametros.get('correo') || correoGuardado);

if (parametros.get('nuevo') === '1') {
    mostrarAlerta('¡Cuenta creada! Te enviamos un código de 6 dígitos para activarla.', 'success');
}

(campoCorreo.value ? campoCodigo : campoCorreo).focus();
soloDigitos(campoCodigo);
limpiarAlEscribir(form);

form.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const correo = limpiarCorreo(campoCorreo.value);
    const codigo = campoCodigo.value.replace(/\s/g, '');

    if (!mostrarErrores(form, { correo: revisarCorreo(correo), codigo: revisarCodigo(codigo) })) return;

    await conBotonOcupado(btnVerificar, 'Verificando...', async () => {
        try {
            const { error } = await supabase.auth.verifyOtp({ email: correo, token: codigo, type: 'email' });

            if (error) {
                mostrarErrores(form, { codigo: mensajeErrorAuth(error) });
                return false;
            }

            try {
                sessionStorage.removeItem('movipass-correo-verificar');
            } catch { /* sin almacenamiento */ }

            const { destino, problema } = destinoDelPerfil(await obtenerPerfilPropio());

            if (problema) {
                await supabase.auth.signOut({ scope: 'local' });
                mostrarAlerta(`Tu correo quedó verificado. ${MENSAJES_ACCESO[problema]}`, 'warning');
                return false;
            }

            window.location.replace(destino);
            return true;
        } catch (error) {
            console.error('No se pudo verificar el código:', error);
            mostrarAlerta(mensajeErrorAuth(error), 'danger');
            return false;
        }
    });
});

function esperarReenvio(segundos) {
    btnReenviar.disabled = true;
    let restante = segundos;

    const pintar = () => {
        btnReenviar.textContent = restante > 0 ? `Reenviar código (${restante} s)` : 'Reenviar código';
    };
    pintar();

    const reloj = setInterval(() => {
        restante -= 1;
        pintar();
        if (restante <= 0) {
            clearInterval(reloj);
            btnReenviar.disabled = false;
        }
    }, 1000);
}

btnReenviar.addEventListener('click', async () => {
    const correo = limpiarCorreo(campoCorreo.value);
    if (!mostrarErrores(form, { correo: revisarCorreo(correo) })) return;

    btnReenviar.disabled = true;

    try {
        const { error } = await supabase.auth.resend({ type: 'signup', email: correo });
        if (error) throw error;

        mostrarAlerta('Te enviamos un código nuevo. Usa el del último correo.', 'success');
        esperarReenvio(ESPERA_REENVIO);
    } catch (error) {
        console.error('No se pudo reenviar el código:', error);
        mostrarAlerta(mensajeErrorAuth(error), 'danger');
        btnReenviar.disabled = false;
    }
});

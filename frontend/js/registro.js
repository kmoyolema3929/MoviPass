// frontend/js/registro.js
// Registro del cliente (cambio 3, parte 3.1). Las reglas están en
// reglasCuenta.js y la base las repite (crear_perfil_al_registrar).
// Después del registro se pide el código de 6 dígitos (verificar-correo.html).

import { mostrarAlerta } from './alertas.js';
import { supabase } from './supabaseClient.js';
import {
    datosDeSignUp, fechaMaximaNacimiento, limpiarCorreo, mensajeErrorAuth, revisarRegistro, textoEdad
} from './reglasCuenta.js';
import { conBotonOcupado, limpiarAlEscribir, mostrarErrores, soloDigitos } from './formularios.js';
import { PANEL_POR_ROL } from './auth.js';

const form = document.getElementById('formRegistro');
const btn = document.getElementById('btnRegistro');
const $ = id => document.getElementById(id);

const campoFecha = $('fechaNacimientoInput');
const edadTexto = $('edadTexto');

// El calendario no deja elegir una fecha de alguien menor de 18 años.
campoFecha.max = fechaMaximaNacimiento();

campoFecha.addEventListener('input', () => {
    const edad = textoEdad(campoFecha.value);
    edadTexto.textContent = edad ? `Edad: ${edad}.` : 'Debes ser mayor de 18 años.';
});

soloDigitos($('cedulaInput'));
soloDigitos($('telefonoInput'));
limpiarAlEscribir(form);

function leerDatos() {
    return {
        cedula: $('cedulaInput').value,
        nombres: $('nombresInput').value,
        apellidos: $('apellidosInput').value,
        fecha_nacimiento: campoFecha.value,
        telefono: $('telefonoInput').value,
        email: $('emailRegistro').value,
        password: $('passRegistro').value,
        confirmacion: $('passConfirmacion').value,
        terminos: $('terminosInput').checked
    };
}

form.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const datos = leerDatos();
    if (!mostrarErrores(form, revisarRegistro(datos))) return;

    await conBotonOcupado(btn, 'Registrando...', async () => {
        const email = limpiarCorreo(datos.email);

        try {
            // El rol NO se envía: la base crea el perfil siempre como 'cliente'.
            const { data, error } = await supabase.auth.signUp({
                email,
                password: datos.password,
                options: { data: datosDeSignUp(datos, 'registro') }
            });

            if (error) {
                mostrarAlerta(mensajeErrorAuth(error), 'danger');
                return false;
            }

            // Con la confirmación por correo activada, un correo repetido no da
            // error: Supabase devuelve un usuario sin "identities".
            if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
                mostrarErrores(form, { email: 'Este correo electrónico ya se encuentra registrado.' });
                return false;
            }

            // Sin confirmación por correo (no debería pasar): ya hay sesión.
            if (data.session) {
                window.location.replace(PANEL_POR_ROL.cliente);
                return true;
            }

            try {
                sessionStorage.setItem('movipass-correo-verificar', email);
            } catch { /* sin almacenamiento: el correo va en la dirección */ }

            window.location.replace(`verificar-correo.html?correo=${encodeURIComponent(email)}&nuevo=1`);
            return true;
        } catch (error) {
            console.error('Error al registrarse:', error);
            mostrarAlerta(mensajeErrorAuth(error), 'danger');
            return false;
        }
    });
});

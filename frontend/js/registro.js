import { mostrarAlerta } from './alertas.js';
import { supabase } from './supabaseClient.js';

const formRegistro = document.getElementById('formRegistro');
const btn = formRegistro.querySelector('button[type="submit"]');
const textoOriginalBtn = btn.textContent;

/* ---------- Validaciones ---------- */

// Algoritmo módulo 10 de la cédula ecuatoriana
function cedulaValida(cedula) {
    if (!/^\d{10}$/.test(cedula)) return false;

    const provincia = parseInt(cedula.slice(0, 2), 10);
    if (provincia < 1 || (provincia > 24 && provincia !== 30)) return false;

    const tercerDigito = parseInt(cedula[2], 10);
    if (tercerDigito > 5) return false;

    let suma = 0;
    for (let i = 0; i < 9; i++) {
        let n = parseInt(cedula[i], 10) * (i % 2 === 0 ? 2 : 1);
        if (n > 9) n -= 9;
        suma += n;
    }
    const verificador = (10 - (suma % 10)) % 10;
    return verificador === parseInt(cedula[9], 10);
}

function validarDatos({ nombres, apellidos, cedula, telefono, password }) {
    if (nombres.length < 2 || apellidos.length < 2) {
        return 'Ingresa tus nombres y apellidos completos.';
    }
    if (!cedulaValida(cedula)) {
        return 'La cédula ingresada no es válida.';
    }
    if (!/^09\d{8}$/.test(telefono)) {
        return 'El teléfono debe tener 10 dígitos y empezar con 09.';
    }
    if (password.length < 8) {
        return 'La contraseña debe tener al menos 8 caracteres.';
    }
    return null; // todo correcto
}

/* ---------- Envío del formulario ---------- */

formRegistro.addEventListener('submit', async (e) => {
    e.preventDefault();

    // .trim() evita espacios accidentales; el correo se guarda en minúsculas
    const datos = {
        nombres: document.getElementById('nombresInput').value.trim(),
        apellidos: document.getElementById('apellidosInput').value.trim(),
        cedula: document.getElementById('cedulaInput').value.trim(),
        telefono: document.getElementById('telefonoInput').value.trim(),
        email: document.getElementById('emailRegistro').value.trim().toLowerCase(),
        password: document.getElementById('passRegistro').value
    };

    const errorValidacion = validarDatos(datos);
    if (errorValidacion) {
        mostrarAlerta(errorValidacion, 'danger');
        return;
    }

    btn.textContent = 'Registrando...';
    btn.disabled = true;
    let exito = false;

    try {
        // IMPORTANTE: el rol NO se envía desde el frontend.
        // El trigger de la BD debe asignar 'cliente' por defecto al crear el perfil.
        const { data, error } = await supabase.auth.signUp({
            email: datos.email,
            password: datos.password,
            options: {
                data: {
                    nombres: datos.nombres,
                    apellidos: datos.apellidos,
                    cedula: datos.cedula,
                    telefono: datos.telefono
                }
            }
        });

        if (error) {
            const msg = error.message || '';
            if (msg.includes('already registered') || msg.includes('already exists')) {
                mostrarAlerta('Este correo electrónico ya se encuentra registrado.', 'danger');
            } else if (msg.includes('Database error')) {
                // Normalmente: cédula duplicada (restricción UNIQUE en "perfiles")
                mostrarAlerta('No se pudo crear el perfil. Revisa que la cédula no esté registrada.', 'danger');
            } else if (msg.toLowerCase().includes('rate limit')) {
                mostrarAlerta('Demasiados intentos. Espera unos minutos e inténtalo de nuevo.', 'warning');
            } else {
                mostrarAlerta('Ocurrió un error al registrarse: ' + msg, 'danger');
            }
            return;
        }

        // Si la confirmación por correo está activada, Supabase NO devuelve error
        // cuando el correo ya existe: devuelve un usuario sin "identities".
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            mostrarAlerta('Este correo electrónico ya se encuentra registrado.', 'danger');
            return;
        }

        // Si hay confirmación por correo no existe sesión todavía
        const mensaje = data.session
            ? '¡Registro exitoso! Redirigiendo al login...'
            : '¡Registro exitoso! Revisa tu correo para confirmar tu cuenta. Redirigiendo al login...';
        mostrarAlerta(mensaje, 'success');

        // El botón queda deshabilitado para evitar un doble registro
        exito = true;
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2500);
    } catch (err) {
        mostrarAlerta('No se pudo conectar con el servidor. Revisa tu conexión.', 'danger');
    } finally {
        // Si hubo cualquier error, se vuelve a habilitar el botón
        if (!exito) {
            btn.textContent = textoOriginalBtn;
            btn.disabled = false;
        }
    }
});
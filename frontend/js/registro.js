// Importar Supabase directamente desde el CDN para usarlo en el navegador
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// Datos enviados por la líder (con la URL corregida)
const supabaseUrl = 'https://tvfexoehpenfkqfcitck.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2ZmV4b2VocGVuZmtxZmNpdGNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNDEwNzMsImV4cCI6MjEwNzYxNzA3M30.zodVu8037ctJ-iIoUEint4y6F8lL6j4pUMPc1PyQjKI';
const supabase = createClient(supabaseUrl, supabaseKey);

// Seleccionar el formulario
const formRegistro = document.querySelector('form');

formRegistro.addEventListener('submit', async (e) => {
    e.preventDefault(); // Evita que la página se recargue

    // Obtener los valores de los inputs usando los IDs que pusiste en el HTML
    const nombres = document.getElementById('nombresInput').value;
    const apellidos = document.getElementById('apellidosInput').value;
    const cedula = document.getElementById('cedulaInput').value;
    const telefono = document.getElementById('telefonoInput').value;
    const email = document.getElementById('emailRegistro').value;
    const password = document.getElementById('passRegistro').value;

    // Cambiar el botón para mostrar que está cargando
    const btn = document.querySelector('button[type="submit"]');
    btn.textContent = 'Registrando...';
    btn.disabled = true;

    // Conectar con Supabase Auth
    // Nota: Guardamos nombres, apellidos, cédula y teléfono en "options.data"
    // El trigger de la base de datos se encargará de moverlos a la tabla "perfiles"
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                nombres: nombres,
                apellidos: apellidos,
                cedula: cedula,
                telefono: telefono
            }
        }
    });

    if (error) {
        // Criterio de aceptación: Mensaje de error si el correo ya existe
        if (error.message.includes('already registered') || error.message.includes('already exists')) {
            alert('Error: Este correo electrónico ya se encuentra registrado.');
        } else {
            alert('Ocurrió un error al registrarse: ' + error.message);
        }
    } else {
        // Criterio de aceptación: Mensaje de éxito
        alert('¡Registro exitoso! Por favor, revisa tu bandeja de entrada para confirmar tu correo electrónico.');
        window.location.href = 'login.html'; // Redirigir al login
    }

    // Restaurar el botón
    btn.textContent = 'Registrarse';
    btn.disabled = false;
});
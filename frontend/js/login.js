// Importar Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// Configuración de Supabase
const supabaseUrl = 'https://tvfexoehpenfkqfcitck.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2ZmV4b2VocGVuZmtxZmNpdGNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNDEwNzMsImV4cCI6MjEwNzYxNzA3M30.zodVu8037ctJ-iIoUEint4y6F8lL6j4pUMPc1PyQjKI'; // Pega tu clave larga real aquí
const supabase = createClient(supabaseUrl, supabaseKey);

// Seleccionar el formulario de login
const formLogin = document.getElementById('formLogin');

if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('emailInput').value;
        const password = document.getElementById('passwordInput').value;
        
        const btn = document.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.textContent = 'Iniciando sesión...';
        btn.disabled = true;

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                alert('Error al iniciar sesión: Revisa tus credenciales.');
            } else {
                alert('¡Inicio de sesión exitoso!');
                // Aquí irá la lógica de roles más adelante
            }
        } catch (error) {
            console.error('Error inesperado:', error);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
}
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
            // 1. Iniciar sesión con correo y contraseña
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (authError) {
                alert('Error al iniciar sesión: Correo o contraseña incorrectos.');
                return; // Detenemos la ejecución aquí si hay error
            }

            // 2. Si el login es exitoso, buscamos el rol en la tabla perfiles
            const userId = authData.user.id;
            
            const { data: perfilData, error: perfilError } = await supabase
                .from('perfiles')
                .select('rol')
                .eq('id', userId)
                .single();

            if (perfilError) {
                console.error('Error al obtener el rol:', perfilError);
                alert('Inicio de sesión exitoso, pero hubo un error al cargar tu perfil.');
            } else {
                // Redirigir al usuario según su rol exacto
                const rol = perfilData.rol;
                
                switch (rol) {
                    case 'administrador':
                        window.location.href = 'administrador/index.html';
                        break;
                    case 'cooperativa':
                        window.location.href = 'cooperativa/index.html';
                        break;
                    case 'oficinista':
                        window.location.href = 'oficinista/index.html';
                        break;
                    case 'cliente':
                        window.location.href = 'cliente/index.html';
                        break;
                    case 'bus':
                        window.location.href = 'bus/index.html';
                        break;
                    default:
                        alert('Error: Tu rol no tiene una pantalla asignada.');
                        // Cerramos sesión por seguridad si el rol es inválido
                        await supabase.auth.signOut();
                        break;
                }
            }

        } catch (error) {
            console.error('Error inesperado:', error);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
}
import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', () => {
    const formPago = document.getElementById('formPago');
    const inputComprobante = document.getElementById('comprobante');
    const btnSubirPago = document.getElementById('btnSubirPago');
    
    // Creamos un div para mostrar los mensajes de Bootstrap dinámicamente
    const contenedorMensaje = document.createElement('div');
    contenedorMensaje.className = 'mt-3';
    formPago.appendChild(contenedorMensaje);

    formPago.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Validación visual de Bootstrap
        if (!formPago.checkValidity()) {
            e.stopPropagation();
            formPago.classList.add('was-validated');
            return;
        }

        const archivo = inputComprobante.files[0];
        if (!archivo) return;

        // 2. Cambiar el botón a estado de carga
        btnSubirPago.disabled = true;
        btnSubirPago.textContent = 'Subiendo comprobante...';
        contenedorMensaje.innerHTML = ''; // Limpiar mensajes anteriores

        try {
            // 3. Obtener el usuario actual (para vincular el pago)
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("No hay un usuario autenticado.");

            // 4. Generar un nombre único para el archivo
            const nombreArchivo = `${Date.now()}_${archivo.name}`;

            // 5. Subir el archivo a Supabase Storage (Bucket: 'comprobantes')
            const { error: uploadError } = await supabase.storage
                .from('comprobantes')
                .upload(nombreArchivo, archivo);

            if (uploadError) throw uploadError;

            // 6. Guardar la RUTA (nombre del archivo) y el ID del usuario en la tabla 'pagos'
            const { error: dbError } = await supabase
                .from('pagos')
                .insert([
                    { 
                        comprobante_url: nombreArchivo, // Guardamos solo el nombre, no la URL pública
                        estado: 'pendiente',
                        usuario_id: user.id // Vinculamos el pago al usuario
                    }
                ]);

            if (dbError) throw dbError;

            // 7. Mensaje de confirmación (Bootstrap en lugar de alert)
            contenedorMensaje.innerHTML = `
                <div class="alert alert-success" role="alert">
                    ¡Comprobante subido con éxito! Tu compra está pendiente de verificación.
                </div>
            `;
            
            formPago.reset();
            formPago.classList.remove('was-validated');

        } catch (error) {
            console.error('Error en el pago:', error.message);
            // Mensaje de error (Bootstrap en lugar de alert)
            contenedorMensaje.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    Ocurrió un error al subir el comprobante. Por favor, intenta de nuevo.
                </div>
            `;
        } finally {
            // Restaurar el botón
            btnSubirPago.disabled = false;
            btnSubirPago.textContent = 'Confirmar Pago';
        }
    });
});
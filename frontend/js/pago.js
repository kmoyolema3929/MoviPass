import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', () => {
    const formPago = document.getElementById('formPago');
    const inputComprobante = document.getElementById('comprobante');
    const btnSubirPago = document.getElementById('btnSubirPago');

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

        try {
            // 3. Generar un nombre único para el archivo
            const nombreArchivo = `${Date.now()}_${archivo.name}`;

            // 4. Subir el archivo a Supabase Storage (Bucket: 'comprobantes')
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('comprobantes')
                .upload(nombreArchivo, archivo);

            if (uploadError) throw uploadError;

            // 5. Obtener la URL del archivo
            const { data: urlData } = supabase.storage
                .from('comprobantes')
                .getPublicUrl(nombreArchivo);

            const urlComprobante = urlData.publicUrl;

            // 6. Guardar la URL en la tabla 'pagos' y cambiar estado a 'pendiente'
            const { error: dbError } = await supabase
                .from('pagos')
                .insert([
                    { 
                        comprobante_url: urlComprobante, 
                        estado: 'pendiente'
                    }
                ]);

            if (dbError) throw dbError;

            // 7. Mensaje de confirmación
            alert('¡Comprobante subido con éxito! Tu compra está pendiente de verificación.');
            
            // Redirigir al inicio
            window.location.href = '../index.html';

        } catch (error) {
            console.error('Error en el pago:', error.message);
            alert('Ocurrió un error al subir el comprobante. Por favor, intenta de nuevo.');
        } finally {
            // Restaurar el botón
            btnSubirPago.disabled = false;
            btnSubirPago.textContent = 'Confirmar Pago';
        }
    });
});
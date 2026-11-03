// frontend/js/alertas.js
export function mostrarAlerta(mensaje, tipo = 'danger') {
    const contenedor = document.getElementById('alertContainer');
    if (!contenedor) return;

    // Inyectar la alerta con estilos de Bootstrap (alert-danger o alert-success)
    contenedor.innerHTML = `
        <div class="alert alert-${tipo} alert-dismissible fade show shadow-sm" role="alert">
            ${mensaje}
        </div>
    `;

    // Limpiar el contenedor después de 5000 milisegundos (5 segundos)
    setTimeout(() => {
        contenedor.innerHTML = '';
    }, 5000);
}
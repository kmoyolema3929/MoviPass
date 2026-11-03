// frontend/js/alertas.js
export function mostrarAlerta(mensaje, tipo = 'danger') {
    const contenedor = document.getElementById('alertContainer');
    if (!contenedor) return;

    // Limpiar contenedor de forma segura contra XSS
    contenedor.replaceChildren();

    // Crear el elemento de alerta de Bootstrap de forma programática
    const div = document.createElement('div');
    div.className = `alert alert-${tipo} alert-dismissible fade show shadow-sm`;
    div.textContent = mensaje; // textContent previene la ejecución de scripts maliciosos

    contenedor.appendChild(div);

    // Limpiar el contenedor después de 5000 milisegundos (5 segundos)
    setTimeout(() => {
        contenedor.replaceChildren();
    }, 5000);
}
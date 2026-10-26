let paradasMemoria = [
    { id: 1, frecuenciaId: "1", nombre: "Terminal Latacunga", hora: "08:45" },
    { id: 2, frecuenciaId: "1", nombre: "Peaje Machachi", hora: "09:30" }
];

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('selectFrecuencia').addEventListener('change', renderizarParadas);
});

function renderizarParadas() {
    const frecuenciaId = document.getElementById('selectFrecuencia').value;
    const tbody = document.getElementById('tablaParadas');

    if (!frecuenciaId) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3 text-muted">Seleccione una frecuencia para ver sus paradas.</td></tr>';
        return;
    }

    const filtradas = paradasMemoria.filter(p => p.frecuenciaId === frecuenciaId);

    if (filtradas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3 text-muted">No hay paradas registradas para esta frecuencia.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    filtradas.forEach((item, index) => {
        tbody.innerHTML += `
            <tr>
                <td>${index + 1}</td>
                <td>${item.nombre}</td>
                <td>${item.hora}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarParada(${item.id})">Eliminar</button>
                </td>
            </tr>
        `;
    });
}

// Manejar el envío del formulario para agregar una parada
document.getElementById('formParada').addEventListener('submit', function(e) {
    e.preventDefault();

    if (!this.checkValidity()) {
        e.stopPropagation();
        this.classList.add('was-validated');
        return;
    }

    const frecuenciaId = document.getElementById('selectFrecuencia').value;
    const nombreParada = document.getElementById('nombreParada').value.trim();
    const horaEstimada = document.getElementById('horaEstimada').value;

    if (!frecuenciaId) {
        alert('Por favor seleccione una frecuencia primero.');
        return;
    }

    // Crear nueva parada simulada en memoria
    const nuevaParada = {
        id: Date.now(),
        frecuenciaId: frecuenciaId,
        nombre: nombreParada,
        hora: horaEstimada
    };

    paradasMemoria.push(nuevaParada);

    // Cerrar el modal, limpiar formulario y refrescar tabla
    var modalElement = document.getElementById('modalParada');
    var modalInstance = bootstrap.Modal.getInstance(modalElement);
    if (modalInstance) {
        modalInstance.hide();
    }

    this.reset();
    this.classList.remove('was-validated');
    renderizarParadas();
});
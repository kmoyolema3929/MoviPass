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

    // Limpieza segura del contenedor sin usar innerHTML
    tbody.replaceChildren();

    if (!frecuenciaId) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.className = 'text-center py-3 text-muted';
        td.textContent = 'Seleccione una frecuencia para ver sus paradas.';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    const filtradas = paradasMemoria.filter(p => p.frecuenciaId === frecuenciaId);

    if (filtradas.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.className = 'text-center py-3 text-muted';
        td.textContent = 'No hay paradas registradas para esta frecuencia.';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    filtradas.forEach((item, index) => {
        const tr = document.createElement('tr');

        const tdIndex = document.createElement('td');
        tdIndex.textContent = index + 1;

        const tdNombre = document.createElement('td');
        tdNombre.textContent = item.nombre;

        const tdHora = document.createElement('td');
        tdHora.textContent = item.hora;

        const tdAcciones = document.createElement('td');
        tdAcciones.className = 'text-center';

        const btnEliminar = document.createElement('button');
        btnEliminar.className = 'btn btn-sm btn-outline-danger';
        btnEliminar.textContent = 'Eliminar';
        btnEliminar.onclick = () => eliminarParada(item.id);

        tdAcciones.appendChild(btnEliminar);

        tr.appendChild(tdIndex);
        tr.appendChild(tdNombre);
        tr.appendChild(tdHora);
        tr.appendChild(tdAcciones);

        tbody.appendChild(tr);
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

    const btnSubmit = this.querySelector('button[type="submit"]');
    const textoOriginal = btnSubmit.textContent;
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Guardando...';

    setTimeout(() => {
        const nuevaParada = {
            id: Date.now(),
            frecuenciaId: frecuenciaId,
            nombre: nombreParada,
            hora: horaEstimada
        };

        paradasMemoria.push(nuevaParada);

        var modalElement = document.getElementById('modalParada');
        var modalInstance = bootstrap.Modal.getInstance(modalElement);
        if (modalInstance) {
            modalInstance.hide();
        }

        this.reset();
        this.classList.remove('was-validated');
        renderizarParadas();

        btnSubmit.disabled = false;
        btnSubmit.textContent = textoOriginal;
    }, 300);
});

// Función para eliminar una parada por ID
function eliminarParada(id) {
    if (!confirm('¿Está seguro de que desea eliminar esta parada?')) {
        return;
    }

    paradasMemoria = paradasMemoria.filter(p => p.id !== id);
    renderizarParadas();
}
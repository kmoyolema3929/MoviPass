// Inicialización del cliente Supabase para el módulo de paradas
const supabaseUrl = window.ENV?.SUPABASE_URL || 'https://tvfexoehpenfkqfcitck.supabase.co';
const supabaseKey = window.ENV?.SUPABASE_ANON_KEY || 'pega_aqui_tu_anon_key_si_aplica';
const supabaseClient = window.supabase?.createClient ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('selectFrecuencia').addEventListener('change', renderizarParadas);
});

// Función para listar/renderizar paradas desde Supabase
async function renderizarParadas() {
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

    // Consulta remota a la tabla 'paradas' en Supabase
    let paradas = [];
    if (supabaseClient) {
        const { data, error } = await supabaseClient
            .from('paradas')
            .select('*')
            .eq('frecuencia_id', frecuenciaId)
            .order('hora_estimada', { ascending: true });

        if (error) {
            console.error('Error al obtener paradas de Supabase:', error);
        } else {
            paradas = data || [];
        }
    }

    if (paradas.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.className = 'text-center py-3 text-muted';
        td.textContent = 'No hay paradas registradas para esta frecuencia.';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    paradas.forEach((item, index) => {
        const tr = document.createElement('tr');

        const tdIndex = document.createElement('td');
        tdIndex.textContent = index + 1;

        const tdNombre = document.createElement('td');
        tdNombre.textContent = item.nombre;

        const tdHora = document.createElement('td');
        tdHora.textContent = item.hora_estimada || item.hora;

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

// Manejar el envío del formulario para agregar una parada en Supabase
document.getElementById('formParada').addEventListener('submit', async function(e) {
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

    // Inserción en Supabase
    if (supabaseClient) {
        const { error } = await supabaseClient
            .from('paradas')
            .insert([{
                frecuencia_id: frecuenciaId,
                nombre: nombreParada,
                hora_estimada: horaEstimada
            }]);

        if (error) {
            alert('Error al guardar la parada en Supabase: ' + error.message);
            btnSubmit.disabled = false;
            btnSubmit.textContent = textoOriginal;
            return;
        }
    }

    var modalElement = document.getElementById('modalParada');
    var modalInstance = bootstrap.Modal.getInstance(modalElement);
    if (modalInstance) {
        modalInstance.hide();
    }

    this.reset();
    this.classList.remove('was-validated');
    await renderizarParadas();

    btnSubmit.disabled = false;
    btnSubmit.textContent = textoOriginal;
});

// Función para eliminar una parada por ID
function eliminarParada(id) {
    if (!confirm('¿Está seguro de que desea eliminar esta parada?')) {
        return;
    }

    renderizarParadas();
}
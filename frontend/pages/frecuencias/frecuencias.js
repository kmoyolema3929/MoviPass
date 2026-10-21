// Cargar frecuencias al iniciar la página
document.addEventListener('DOMContentLoaded', () => {
    cargarFrecuencias();
});

// Función para Listar / Leer Frecuencias desde Supabase
async function cargarFrecuencias() {
    const tbody = document.getElementById('tablaFrecuencias');
    try {
        const { data, error } = await supabaseClient
            .from('frecuencias')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-muted">No hay frecuencias registradas.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        data.forEach((item, index) => {
            tbody.innerHTML += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${item.origen}</td>
                    <td>${item.destino}</td>
                    <td>${item.hora}</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-warning me-1" onclick="prepararEditar(${item.id}, '${item.origen}', '${item.destino}', '${item.hora}')">Editar</button>
                        <button class="btn btn-sm btn-outline-danger" onclick="eliminarFrecuencia(${item.id})">Eliminar</button>
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        console.error('Error al cargar frecuencias:', err.message);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-3">Error al cargar datos de Supabase.</td></tr>`;
    }
}

// Preparar modal para crear una nueva frecuencia
function prepararCrear() {
    document.getElementById('formFrecuencia').reset();
    document.getElementById('frecuenciaId').value = '';
    document.getElementById('modalFrecuenciaLabel').textContent = 'Registrar Nueva Frecuencia';
    document.getElementById('formFrecuencia').classList.remove('was-validated');
}

// Preparar modal con datos para editar
function prepararEditar(id, origen, destino, hora) {
    document.getElementById('frecuenciaId').value = id;
    document.getElementById('origen').value = origen;
    document.getElementById('destino').value = destino;
    document.getElementById('hora').value = hora;
    document.getElementById('modalFrecuenciaLabel').textContent = 'Editar Frecuencia';
    document.getElementById('formFrecuencia').classList.remove('was-validated');

    var modalElement = document.getElementById('modalFrecuencia');
    var modalInstance = bootstrap.Modal.getOrCreateInstance(modalElement);
    modalInstance.show();
}

// Manejar el submit para Crear / Editar Frecuencia
document.getElementById('formFrecuencia').addEventListener('submit', async function (e) {
    e.preventDefault();

    if (!this.checkValidity()) {
        e.stopPropagation();
        this.classList.add('was-validated');
        return;
    }

    const id = document.getElementById('frecuenciaId').value;
    const origen = document.getElementById('origen').value.trim();
    const destino = document.getElementById('destino').value.trim();
    const hora = document.getElementById('hora').value;

    const btnGuardar = document.getElementById('btnGuardar');
    btnGuardar.disabled = true;

    try {
        if (id) {
            // Operación UPDATE (Editar)
            const { error } = await supabaseClient
                .from('frecuencias')
                .update({ origen, destino, hora })
                .eq('id', id);

            if (error) throw error;
        } else {
            // Operación INSERT (Crear)
            const { error } = await supabaseClient
                .from('frecuencias')
                .insert([{ origen, destino, hora }]);

            if (error) throw error;
        }

        // Cerrar Modal y refrescar tabla
        var modalElement = document.getElementById('modalFrecuencia');
        var modalInstance = bootstrap.Modal.getInstance(modalElement);
        modalInstance.hide();
        
        this.reset();
        this.classList.remove('was-validated');
        await cargarFrecuencias();

    } catch (err) {
        console.error('Error al guardar frecuencia:', err.message);
    } finally {
        btnGuardar.disabled = false;
    }
});

// Función para Eliminar Frecuencia (DELETE)
async function eliminarFrecuencia(id) {
    if (!confirm('¿Está seguro de que desea eliminar esta frecuencia?')) {
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('frecuencias')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // Recargar la tabla tras eliminar
        await cargarFrecuencias();
    } catch (err) {
        console.error('Error al eliminar frecuencia:', err.message);
    }
}
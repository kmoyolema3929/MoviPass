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
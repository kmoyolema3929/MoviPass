import { supabase as supabaseClient } from "../../js/supabaseClient.js";

document.addEventListener('DOMContentLoaded', () => {
    listarHojasRuta();
});

// Función para listar las hojas de ruta existentes en Supabase
async function listarHojasRuta() {
    const tbody = document.getElementById('tablaGestionHojasRuta');
    if (!tbody) return;

    tbody.replaceChildren();

    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('hojas_ruta')
        .select(`
            id,
            fecha,
            estado,
            frecuencias (origen, destino),
            buses (disco, placa)
        `)
        .order('fecha', { ascending: false });

    if (error) {
        console.error('Error al listar hojas de ruta:', error);
        return;
    }

    if (!data || data.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        td.className = 'text-center py-3 text-muted';
        td.textContent = 'No hay hojas de ruta registradas.';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    data.forEach((item, index) => {
        const tr = document.createElement('tr');

        const tdIndex = document.createElement('td');
        tdIndex.textContent = index + 1;

        const tdRuta = document.createElement('td');
        tdRuta.textContent = item.frecuencias ? `${item.frecuencias.origen} -> ${item.frecuencias.destino}` : 'N/A';

        const tdBus = document.createElement('td');
        tdBus.textContent = item.buses ? `Disco: ${item.buses.disco} (${item.buses.placa})` : 'N/A';

        const tdFecha = document.createElement('td');
        tdFecha.textContent = item.fecha;

        const tdEstado = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = item.estado === 'Completado' ? 'badge bg-secondary' : 'badge bg-success';
        badge.textContent = item.estado;
        tdEstado.appendChild(badge);

        const tdAcciones = document.createElement('td');
        tdAcciones.className = 'text-center';

        const btnEditar = document.createElement('button');
        btnEditar.className = 'btn btn-sm btn-outline-primary me-2';
        btnEditar.textContent = 'Editar';
        btnEditar.onclick = () => editarHojaRuta(item.id, item.estado);

        const btnEliminar = document.createElement('button');
        btnEliminar.className = 'btn btn-sm btn-outline-danger';
        btnEliminar.textContent = 'Eliminar';
        btnEliminar.onclick = () => eliminarHojaRuta(item.id);

        tdAcciones.append(btnEditar, btnEliminar);
        tr.append(tdIndex, tdRuta, tdBus, tdFecha, tdEstado, tdAcciones);
        tbody.appendChild(tr);
    });
}

// Función para cambiar el estado de una hoja de ruta existente
async function editarHojaRuta(id, estadoActual) {
    const nuevoEstado = estadoActual === 'Programado' ? 'Completado' : 'Programado';
    
    if (!confirm(`¿Desea cambiar el estado de la hoja de ruta a '${nuevoEstado}'?`)) return;

    if (supabaseClient) {
        const { error } = await supabaseClient
            .from('hojas_ruta')
            .update({ estado: nuevoEstado })
            .eq('id', id);

        if (error) {
            alert('Error al actualizar la hoja de ruta: ' + error.message);
            return;
        }
    }

    await listarHojasRuta();
}

// Función para eliminar una hoja de ruta
async function eliminarHojaRuta(id) {
    if (!confirm('¿Está seguro de eliminar esta hoja de ruta?')) return;
    
    if (supabaseClient) {
        const { error } = await supabaseClient
            .from('hojas_ruta')
            .delete()
            .eq('id', id);

        if (error) {
            alert('Error al eliminar la hoja de ruta: ' + error.message);
            return;
        }
    }
    
    await listarHojasRuta();
}
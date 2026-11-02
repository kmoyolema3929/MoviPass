import { supabase as supabaseClient } from "../../js/supabaseClient.js";

document.addEventListener('DOMContentLoaded', () => {
    cargarFrecuencias();
    cargarBuses();
    document.getElementById('formHojaRuta').addEventListener('submit', generarHojaRuta);
});

// Cargar opciones en el select de frecuencias
async function cargarFrecuencias() {
    const select = document.getElementById('selectFrecuencia');
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('frecuencias')
        .select('id, origen, destino, hora_salida');

    if (error) {
        console.error('Error al cargar frecuencias:', error);
        return;
    }

    data.forEach(f => {
        const option = document.createElement('option');
        option.value = f.id;
        option.textContent = `${f.origen} -> ${f.destino} (${f.hora_salida})`;
        select.appendChild(option);
    });
}

// Cargar opciones en el select de buses
async function cargarBuses() {
    const select = document.getElementById('selectBus');
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('buses')
        .select('id, disco, placa');

    if (error) {
        console.error('Error al cargar buses:', error);
        return;
    }

    data.forEach(b => {
        const option = document.createElement('option');
        option.value = b.id;
        option.textContent = `Disco: ${b.disco} - Placa: ${b.placa}`;
        select.appendChild(option);
    });
}

// Generación de la hoja de ruta consultando paradas en Supabase
async function generarHojaRuta(e) {
    e.preventDefault();

    const frecuenciaId = document.getElementById('selectFrecuencia').value;
    const busId = document.getElementById('selectBus').value;
    const fechaViaje = document.getElementById('fechaViaje').value;
    const tbody = document.getElementById('tablaHojaRuta');

    // Limpieza segura de la tabla
    tbody.replaceChildren();

    if (!frecuenciaId || !busId || !fechaViaje) {
        alert('Por favor complete todos los campos.');
        return;
    }

    let paradas = [];
    if (supabaseClient) {
        const { data, error } = await supabaseClient
            .from('paradas')
            .select('*')
            .eq('frecuencia_id', frecuenciaId)
            .order('hora_estimada', { ascending: true });

        if (error) {
            console.error('Error al consultar paradas:', error);
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

        const tdEstado = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = 'badge bg-success';
        badge.textContent = 'Programado';
        tdEstado.appendChild(badge);

        tr.append(tdIndex, tdNombre, tdHora, tdEstado);
        tbody.appendChild(tr);
    });
}
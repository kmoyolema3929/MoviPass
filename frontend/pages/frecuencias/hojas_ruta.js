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

// Función preliminar para la generación de la hoja de ruta
function generarHojaRuta(e) {
    e.preventDefault();
    alert('Parámetros seleccionados correctamente. Generando hoja de ruta...');
}
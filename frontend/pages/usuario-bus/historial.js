// Historial de viajes del usuario bus (cambio 4, parte 4.3).
import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { mostrarAlerta } from '../../js/alertas.js';
import { dinero, formatearFecha, formatearHora, sumarDias } from '../../js/validaciones.js';
import { fechaHoyEcuador } from '../../js/combos.js';
import { conBotonOcupado, limpiarAlEscribir, mostrarErrores } from '../../js/formularios.js';
import { mensajeErrorBase } from '../../js/erroresBase.js';
import { estadoOperativo, horaReal, revisarRangoFechas, textoBus } from '../../js/reglasOperacion.js';

const $ = (id) => document.getElementById(id);
const form = $('formFiltro');

function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    return nodo;
}

function tarjeta(viaje) {
    const estado = estadoOperativo(viaje.estado_operativo);
    const caja = el('article', 'card mb-2');
    const cuerpo = el('div', 'card-body');

    const fila = el('div', 'd-flex justify-content-between align-items-start gap-2');
    const titulo = el('div');
    titulo.append(
        el('div', 'fw-bold fs-5', `${formatearFecha(viaje.fecha)} · ${formatearHora(viaje.hora)}`),
        el('div', 'fw-semibold', `${viaje.origen} → ${viaje.destino}`)
    );
    fila.append(titulo, el('span', `badge ${estado.clase}`, estado.texto));

    const datos = el('ul', 'list-unstyled mb-2 mt-2');
    [
        `Bus ${textoBus(viaje.bus)}`,
        viaje.salida_real ? `Salida ${horaReal(viaje.salida_real)}${viaje.llegada_real ? ` · Llegada ${horaReal(viaje.llegada_real)}` : ''}` : 'No se inició',
        `Abordaron ${viaje.abordados} · No se presentaron ${viaje.por_abordar}`,
        `En ruta: ${viaje.en_ruta?.pasajeros ?? 0} pasajero(s), ${dinero(viaje.en_ruta?.total ?? 0)}`
    ].forEach((texto) => datos.appendChild(el('li', '', texto)));

    cuerpo.append(fila, datos);

    if (['en_curso', 'finalizado'].includes(viaje.estado_operativo)) {
        const enlace = el('a', 'btn btn-outline-dark w-100 fw-bold', 'Ver recaudación en ruta');
        enlace.href = `recaudacion.html?viaje=${encodeURIComponent(viaje.id)}`;
        cuerpo.appendChild(enlace);
    }

    caja.appendChild(cuerpo);
    return caja;
}

async function cargar() {
    const { data, error } = await supabase.rpc('historial_viajes_bus', {
        p_desde: $('desde').value,
        p_hasta: $('hasta').value
    });

    if (error) {
        console.error('No se pudo cargar el historial:', error);
        mostrarAlerta(mensajeErrorBase(error, 'cargar el historial'), 'danger');
        return;
    }

    const viajes = data?.viajes ?? [];
    const lista = $('listaHistorial');
    lista.replaceChildren();

    const centavos = viajes.reduce((suma, v) => suma + Math.round(Number(v.en_ruta?.total ?? 0) * 100), 0);
    $('totales').textContent = viajes.length === 0
        ? ''
        : `${viajes.length} viaje(s) · Cobrado en ruta: ${dinero(centavos / 100)}`;

    if (viajes.length === 0) {
        lista.appendChild(el('p', 'fw-bold', 'No tienes viajes en esas fechas.'));
        return;
    }

    viajes.forEach((v) => lista.appendChild(tarjeta(v)));
}

limpiarAlEscribir(form);

form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!mostrarErrores(form, revisarRangoFechas($('desde').value, $('hasta').value))) return;
    await conBotonOcupado(form.querySelector('[type="submit"]'), 'Cargando...', cargar);
});

async function iniciar() {
    const rol = await exigirRoles(['bus']);
    if (!rol) return;

    const hoy = fechaHoyEcuador();
    $('desde').value = sumarDias(hoy, -30);
    $('hasta').value = hoy;
    $('desde').max = hoy;
    $('hasta').max = hoy;

    await cargar();
}

iniciar();

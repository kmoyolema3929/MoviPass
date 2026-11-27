// Reporte de recaudación en camino (cambio 4, parte 4.3): solo los
// pasajeros EN_RUTA y el total en efectivo de un viaje. Lo ven el usuario
// bus del viaje, el oficinista y el gerente de la cooperativa (la base lo
// exige en recaudacion_en_ruta). Se exporta a PDF con jsPDF.
import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { mostrarAlerta } from '../../js/alertas.js';
import { dinero, formatearFecha, formatearHora } from '../../js/validaciones.js';
import { mensajeErrorBase } from '../../js/erroresBase.js';
import { fechaHoyEcuador } from '../../js/combos.js';
import {
    estadoOperativo, horaReal, resumenRecaudacion, textoBus, textoUsuarioBus
} from '../../js/reglasOperacion.js';

const $ = (id) => document.getElementById(id);
const viajeId = new URLSearchParams(window.location.search).get('viaje');

let reporte = null;

function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    return nodo;
}

function celdas(tr, valores, finales = 0) {
    valores.forEach((valor, i) => tr.appendChild(el('td', i >= valores.length - finales ? 'text-end' : '', valor)));
    return tr;
}

/** Datos del encabezado (pantalla y PDF). */
function datosEncabezado(viaje) {
    return [
        ['Cooperativa', viaje.cooperativa?.nombre ?? '—'],
        ['Ruta', `${viaje.origen} → ${viaje.destino}`],
        ['Fecha y hora', `${formatearFecha(viaje.fecha)} · ${formatearHora(viaje.hora)}`],
        ['Bus', textoBus(viaje.bus)],
        ['Usuario bus', textoUsuarioBus(viaje.usuario_bus) || '—'],
        ['Estado', estadoOperativo(viaje.estado_operativo).texto],
        ['Salida real', horaReal(viaje.salida_real) || '—'],
        ['Llegada real', horaReal(viaje.llegada_real) || '—']
    ];
}

function filasDetalle(lineas) {
    return lineas.map((l) => [
        horaReal(l.vendido_en),
        String(l.numero_asiento),
        `${l.pasajero} (${l.cedula})`,
        l.tarifa,
        l.parada ?? '—',
        dinero(l.precio)
    ]);
}

function dibujar() {
    const { viaje, lineas = [] } = reporte;
    const resumen = resumenRecaudacion(lineas);

    $('datosViaje').replaceChildren(...datosEncabezado(viaje).flatMap(([etiqueta, valor]) => [
        el('dt', 'col-5 col-sm-4', etiqueta),
        el('dd', 'col-7 col-sm-8 mb-1', valor)
    ]));

    $('totalGrande').textContent = dinero(resumen.total);
    $('pasajerosTotal').textContent = resumen.pasajeros === 1 ? '1 pasajero en ruta' : `${resumen.pasajeros} pasajeros en ruta`;

    const tarifas = $('tablaTarifas');
    tarifas.replaceChildren();
    if (resumen.porTarifa.length === 0) {
        tarifas.appendChild(celdas(el('tr'), ['Sin ventas en ruta.', '', '']));
    }
    resumen.porTarifa.forEach((t) => tarifas.appendChild(
        celdas(el('tr'), [t.tarifa, String(t.pasajeros), dinero(t.total)], 2)));

    const detalle = $('tablaDetalle');
    detalle.replaceChildren();
    if (lineas.length === 0) {
        const tr = el('tr');
        const td = el('td', 'text-center py-3', 'No se vendieron boletos en el camino.');
        td.colSpan = 6;
        tr.appendChild(td);
        detalle.appendChild(tr);
    }
    filasDetalle(lineas).forEach((fila) => detalle.appendChild(celdas(el('tr'), fila, 1)));

    $('reporte').classList.remove('d-none');
}

function descargarPdf() {
    const jsPDF = globalThis.jspdf?.jsPDF;
    if (typeof jsPDF !== 'function') {
        mostrarAlerta('No se pudo cargar el generador de PDF. Usa "Imprimir" y elige "Guardar como PDF".', 'warning');
        return;
    }

    const { viaje, lineas = [], generado_en: generado } = reporte;
    const resumen = resumenRecaudacion(lineas);
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const conTabla = typeof doc.autoTable === 'function';
    // La fuente estándar del PDF no tiene la flecha ni el signo menos tipográfico.
    const texto = (valor) => String(valor ?? '').replace(/→/g, '-').replace(/−/g, '-');
    const filas = (lista) => lista.map((fila) => fila.map(texto));

    doc.setFontSize(16);
    doc.text('MoviPass - Recaudación en ruta', 40, 50);
    doc.setFontSize(10);
    const momento = new Date(generado ?? Date.now());
    doc.text(`Generado: ${formatearFecha(fechaHoyEcuador(momento))} ${horaReal(momento)} (hora de Ecuador)`, 40, 66);

    let y = 90;
    datosEncabezado(viaje).forEach(([etiqueta, valor]) => {
        doc.text(texto(`${etiqueta}: ${valor}`), 40, y);
        y += 14;
    });

    doc.setFontSize(13);
    doc.text(`Total en efectivo: ${dinero(resumen.total)} (${resumen.pasajeros} pasajero(s))`, 40, y + 8);
    y += 26;

    if (conTabla) {
        doc.autoTable({
            startY: y,
            head: [['Tarifa', 'Pasajeros', 'Total']],
            body: filas(resumen.porTarifa.map((t) => [t.tarifa, String(t.pasajeros), dinero(t.total)])),
            styles: { fontSize: 9 },
            headStyles: { fillColor: [17, 17, 17] }
        });
        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 16,
            head: [['Hora', 'Asiento', 'Pasajero', 'Tarifa', 'Sube en', 'Precio']],
            body: lineas.length ? filas(filasDetalle(lineas)) : [['', '', 'No se vendieron boletos en el camino.', '', '', '']],
            styles: { fontSize: 9 },
            headStyles: { fillColor: [17, 17, 17] },
            columnStyles: { 5: { halign: 'right' } }
        });
    } else {
        doc.setFontSize(9);
        filasDetalle(lineas).forEach((fila) => {
            y += 14;
            doc.text(texto(fila.join('   ')), 40, y);
        });
    }

    doc.save(`recaudacion_en_ruta_${viaje.fecha}_${formatearHora(viaje.hora).replace(':', '')}.pdf`);
}

$('btnPdf').addEventListener('click', descargarPdf);
$('btnImprimir').addEventListener('click', () => window.print());

async function iniciar() {
    const rol = await exigirRoles(['bus', 'oficinista', 'cooperativa', 'administrador']);
    if (!rol) return;

    // Volver: el usuario bus a sus viajes; el oficinista y el gerente a la lista de recaudación.
    if (rol !== 'bus') {
        $('marca').textContent = rol === 'oficinista' ? 'MoviPass - Oficinista'
            : rol === 'cooperativa' ? 'MoviPass - Cooperativa' : 'MoviPass - Administrador';
        $('marca').href = `../${rol}/index.html`;
        $('btnVolver').href = '../oficinista/recaudacion-ruta.html';
        document.body.classList.remove('app-bus');
    }

    if (!viajeId) {
        mostrarAlerta('Falta el viaje. Ábrelo desde la lista de viajes.', 'warning');
        return;
    }

    try {
        const { data, error } = await supabase.rpc('recaudacion_en_ruta', { p_viaje_id: viajeId });
        if (error) throw error;
        reporte = data;
        dibujar();
    } catch (error) {
        console.error('No se pudo cargar la recaudación:', error);
        mostrarAlerta(mensajeErrorBase(error, 'cargar la recaudación'), 'danger');
    }
}

iniciar();

// Recaudación en ruta por viaje (cambio 4, parte 4.3), para el oficinista y
// el gerente de la cooperativa. El detalle y el PDF de cada viaje están en
// usuario-bus/recaudacion.html (la misma pantalla que ve el usuario bus).
import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { obtenerContextoGestion } from '../../js/contextoUsuario.js';
import { mostrarAlerta } from '../../js/alertas.js';
import { dinero, formatearFecha, formatearHora, sumarDias } from '../../js/validaciones.js';
import { fechaHoyEcuador, ponerOpciones } from '../../js/combos.js';
import { conBotonOcupado, limpiarAlEscribir, mostrarErrores } from '../../js/formularios.js';
import { mensajeErrorBase } from '../../js/erroresBase.js';
import { estadoOperativo, revisarRangoFechas, textoBus, textoUsuarioBus } from '../../js/reglasOperacion.js';

const $ = (id) => document.getElementById(id);
const form = $('formFiltro');
const tabla = $('tablaViajes');

let cooperativas = [];

function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    return nodo;
}

function filaInformativa(texto, clase = 'text-muted') {
    const tr = el('tr');
    const td = el('td', `text-center py-3 ${clase}`, texto);
    td.colSpan = 9;
    tr.appendChild(td);
    tabla.replaceChildren(tr);
    $('pieTabla').replaceChildren();
}

async function cargar() {
    const { data, error } = await supabase.rpc('recaudacion_de_cooperativa', {
        p_cooperativa_id: $('cooperativa').value,
        p_desde: $('desde').value,
        p_hasta: $('hasta').value
    });

    if (error) {
        console.error('No se pudo cargar la recaudación:', error);
        filaInformativa('No se pudo cargar la recaudación.', 'text-danger');
        mostrarAlerta(mensajeErrorBase(error, 'cargar la recaudación'), 'danger');
        return;
    }

    const viajes = data?.viajes ?? [];
    if (viajes.length === 0) {
        filaInformativa('No hay viajes en curso ni finalizados en esas fechas.');
        return;
    }

    tabla.replaceChildren();
    let pasajeros = 0;
    let centavos = 0;

    viajes.forEach((v) => {
        const estado = estadoOperativo(v.estado_operativo);
        const tr = el('tr');
        const tdEstado = el('td');
        tdEstado.appendChild(el('span', `badge ${estado.clase}`, estado.texto));

        const enlace = el('a', 'btn btn-sm btn-outline-primary', 'Ver');
        enlace.href = `../usuario-bus/recaudacion.html?viaje=${encodeURIComponent(v.id)}`;
        const tdDetalle = el('td', 'text-center');
        tdDetalle.appendChild(enlace);

        tr.append(
            el('td', '', formatearFecha(v.fecha)),
            el('td', '', formatearHora(v.hora)),
            el('td', '', `${v.origen} → ${v.destino}`),
            el('td', '', textoBus(v.bus)),
            el('td', '', textoUsuarioBus(v.usuario_bus) || '—'),
            tdEstado,
            el('td', 'text-end', String(v.en_ruta?.pasajeros ?? 0)),
            el('td', 'text-end', dinero(v.en_ruta?.total ?? 0)),
            tdDetalle
        );
        tabla.appendChild(tr);

        pasajeros += Number(v.en_ruta?.pasajeros ?? 0);
        centavos += Math.round(Number(v.en_ruta?.total ?? 0) * 100);
    });

    const pie = el('tr', 'table-light fw-bold');
    const etiqueta = el('td', '', `Total (${viajes.length} viaje(s))`);
    etiqueta.colSpan = 6;
    pie.append(etiqueta, el('td', 'text-end', String(pasajeros)), el('td', 'text-end', dinero(centavos / 100)), el('td'));
    $('pieTabla').replaceChildren(pie);
}

limpiarAlEscribir(form);

form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const errores = {
        cooperativa: $('cooperativa').value ? '' : 'Elige la cooperativa.',
        ...revisarRangoFechas($('desde').value, $('hasta').value)
    };
    if (!mostrarErrores(form, errores)) return;
    await conBotonOcupado(form.querySelector('[type="submit"]'), 'Consultando...', cargar);
});

async function iniciar() {
    const rol = await exigirRoles(['oficinista', 'cooperativa', 'administrador']);
    if (!rol) return;

    $('marca').href = `../${rol}/index.html`;
    $('btnVolver').href = `../${rol}/index.html`;
    if (rol === 'cooperativa') $('marca').textContent = 'MoviPass - Cooperativa';
    if (rol === 'administrador') $('marca').textContent = 'MoviPass - Administrador';

    const hoy = fechaHoyEcuador();
    $('desde').value = sumarDias(hoy, -7);
    $('hasta').value = hoy;
    $('desde').max = hoy;
    $('hasta').max = hoy;

    try {
        ({ cooperativas } = await obtenerContextoGestion());

        if (cooperativas.length === 0) {
            filaInformativa('Tu cuenta aún no está asignada a una cooperativa. Contacta al administrador.', 'text-danger');
            return;
        }

        ponerOpciones($('cooperativa'), cooperativas, { valor: (c) => c.id, texto: (c) => c.nombre });
        $('filaCooperativa').classList.toggle('d-none', cooperativas.length < 2);

        await cargar();
    } catch (error) {
        console.error('Error al iniciar la recaudación:', error);
        mostrarAlerta(mensajeErrorBase(error, 'cargar la recaudación'), 'danger');
    }
}

iniciar();

import { supabase } from './supabaseClient.js';
import { exigirRoles } from './guardas.js';
import { mostrarAlerta } from './alertas.js';
import { dinero, formatearFecha, formatearHora } from './validaciones.js';

const $ = (id) => document.getElementById(id);

function nombreEstado(estado) {
    return {
        pendiente_comprobante: 'Esperando comprobante',
        pendiente_validacion: 'En validación',
        aprobada: 'Aprobada',
        rechazada: 'Rechazada',
        vencida: 'Vencida',
    }[estado] ?? estado;
}

function claseEstado(estado) {
    return {
        pendiente_comprobante: 'text-bg-warning',
        pendiente_validacion: 'text-bg-info',
        aprobada: 'text-bg-success',
        rechazada: 'text-bg-danger',
        vencida: 'text-bg-secondary',
    }[estado] ?? 'text-bg-secondary';
}

function celda(texto, clase = '') {
    const td = document.createElement('td');
    td.className = clase;
    td.textContent = texto;
    return td;
}

function filaInformativa(texto, clase = 'text-muted') {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = `text-center py-3 ${clase}`;
    td.textContent = texto;
    tr.appendChild(td);
    $('tablaHistorial').appendChild(tr);
}

function crearEnlace(texto, href, clase = 'btn btn-sm btn-outline-primary') {
    const enlace = document.createElement('a');
    enlace.href = href;
    enlace.className = clase;
    enlace.textContent = texto;
    return enlace;
}

function crearFila(compra) {
    const tr = document.createElement('tr');

    const fechaCompra = compra.creado_en
        ? new Date(compra.creado_en).toLocaleDateString('es-EC')
        : '—';

    const frecuencia = compra.viaje?.frecuencia;
    const viajeTexto = compra.viaje && frecuencia
        ? `${frecuencia.origen} → ${frecuencia.destino}`
        : '—';
    const viajeDetalle = compra.viaje
        ? `${formatearFecha(compra.viaje.fecha)}${frecuencia ? ` · ${formatearHora(frecuencia.hora)}` : ''}`
        : '';

    const tdViaje = document.createElement('td');
    const ruta = document.createElement('div');
    ruta.textContent = viajeTexto;
    const detalle = document.createElement('div');
    detalle.className = 'small text-muted';
    detalle.textContent = viajeDetalle;
    tdViaje.append(ruta, detalle);

    const asientos = (compra.boletos ?? [])
        .map((boleto) => boleto.numero_asiento)
        .sort((a, b) => Number(a) - Number(b))
        .join(', ') || '—';

    const tdEstado = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${claseEstado(compra.estado)}`;
    badge.textContent = nombreEstado(compra.estado);
    tdEstado.appendChild(badge);

    if (compra.estado === 'rechazada' && compra.motivo_rechazo) {
        const motivo = document.createElement('div');
        motivo.className = 'small text-danger mt-1';
        motivo.textContent = compra.motivo_rechazo;
        tdEstado.appendChild(motivo);
    }

    if (compra.estado === 'pendiente_comprobante' && compra.vence_en) {
        const vence = document.createElement('div');
        vence.className = 'small text-muted mt-1';
        vence.textContent = `Vence: ${new Date(compra.vence_en).toLocaleString('es-EC')}`;
        tdEstado.appendChild(vence);
    }

    const tdAcciones = document.createElement('td');
    tdAcciones.className = 'text-center';

    if (compra.estado === 'pendiente_comprobante') {
        tdAcciones.appendChild(
            crearEnlace('Subir comprobante', `pago.html?compra_id=${encodeURIComponent(compra.id)}`, 'btn btn-sm btn-warning')
        );
    } else {
        tdAcciones.appendChild(
            crearEnlace('Ver detalle', `boleto.html?compra_id=${encodeURIComponent(compra.id)}`)
        );
    }

    tr.append(
        celda(fechaCompra, 'text-nowrap'),
        tdViaje,
        celda(asientos),
        celda(compra.metodo_pago === 'deposito' ? 'Depósito' : 'Transferencia'),
        tdEstado,
        celda(dinero(compra.total), 'text-end text-nowrap'),
        tdAcciones
    );

    return tr;
}

async function cargarHistorial() {
    const tbody = $('tablaHistorial');
    tbody.replaceChildren();
    filaInformativa('Cargando historial...');

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Debes iniciar sesión.');

        const { data, error } = await supabase
            .from('compras')
            .select(`
                id, estado, metodo_pago, total, creado_en, vence_en, motivo_rechazo,
                viaje:viajes (
                    fecha,
                    frecuencia:frecuencias ( origen, destino, hora )
                ),
                boletos ( numero_asiento, estado, codigo )
            `)
            .eq('comprador_id', user.id)
            .order('creado_en', { ascending: false });

        if (error) throw error;

        tbody.replaceChildren();

        if (!data || data.length === 0) {
            filaInformativa(
                'No tienes compras todavía. Busca un viaje para empezar.',
                'text-muted'
            );
            $('resumenCompras').textContent = '0 compras';
            return;
        }

        data.forEach((compra) => tbody.appendChild(crearFila(compra)));
        $('resumenCompras').textContent =
            `${data.length} ${data.length === 1 ? 'compra' : 'compras'}`;
    } catch (error) {
        console.error('No se pudo cargar el historial:', error);
        tbody.replaceChildren();
        filaInformativa('No se pudo cargar tu historial. Inténtalo de nuevo más tarde.', 'text-danger');
        mostrarAlerta(error.message || 'No se pudo cargar el historial.', 'danger');
    }
}

async function iniciar() {
    const rol = await exigirRoles(['cliente']);
    if (!rol) return;

    $('btnActualizar').addEventListener('click', cargarHistorial);
    await cargarHistorial();
}

iniciar();

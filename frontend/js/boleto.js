import { supabase } from './supabaseClient.js';
import { exigirRoles } from './guardas.js';
import { mostrarAlerta } from './alertas.js';
import { dinero, formatearFecha, formatearHora } from './validaciones.js';
import { mensajeErrorBase } from './erroresBase.js';
import { NOMBRES_TARIFA, crearBoletoImpreso, datosBoleto } from './boletoImpreso.js';
import { textoBus } from './reglasOperacion.js';

// Cambio 4, parte 4.2: boleto digital con QR (el código único del boleto),
// descargable e imprimible; se actualiza solo cuando aprueban el pago.
const $ = (id) => document.getElementById(id);

let compra = null;
let canal = null;

function nombreEstado(estado) {
    return {
        pendiente_comprobante: 'Esperando comprobante',
        pendiente_validacion: 'Comprobante en validación',
        aprobada: 'Pago aprobado',
        rechazada: 'Pago rechazado',
        vencida: 'Reserva vencida',
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

function textoFechaHora(valor) {
    if (!valor) return '—';
    try {
        return new Date(valor).toLocaleString('es-EC');
    } catch {
        return String(valor);
    }
}

function crearDato(etiqueta, valor) {
    const dt = document.createElement('dt');
    dt.className = 'col-5 col-sm-4';
    dt.textContent = etiqueta;

    const dd = document.createElement('dd');
    dd.className = 'col-7 col-sm-8 text-break';
    dd.textContent = valor;

    return [dt, dd];
}

function renderizarResumen() {
    const { viaje } = compra;

    const dl = document.createElement('dl');
    dl.className = 'row mb-0';

    const frecuencia = viaje?.frecuencia;
    const filas = [
        ['Ruta', frecuencia ? `${frecuencia.origen} → ${frecuencia.destino}` : '—'],
        ['Fecha', viaje ? formatearFecha(viaje.fecha) : '—'],
        ['Hora', frecuencia ? formatearHora(frecuencia.hora) : '—'],
        ['Cooperativa', viaje?.bus?.cooperativa?.nombre ?? '—'],
        ['Método de pago', compra.metodo_pago === 'deposito' ? 'Depósito' : 'Transferencia'],
        ['Total', dinero(compra.total)],
        ['Compra realizada', textoFechaHora(compra.creado_en)],
    ];

    if (compra.estado === 'pendiente_comprobante' && compra.vence_en) {
        filas.push(['Sube tu comprobante antes de', textoFechaHora(compra.vence_en)]);
    }

    filas.forEach(([etiqueta, valor]) => {
        dl.append(...crearDato(etiqueta, valor));
    });

    $('resumenCompra').replaceChildren(dl);
}

/** Datos del viaje para el boleto impreso. */
function datosViaje() {
    const viaje = compra.viaje;
    const frecuencia = viaje?.frecuencia;
    return {
        origen: frecuencia?.origen,
        destino: frecuencia?.destino,
        fecha: viaje?.fecha,
        hora: frecuencia?.hora,
        bus: viaje?.bus ? textoBus(viaje.bus) : '',
        cooperativa: viaje?.bus?.cooperativa?.nombre ?? '',
    };
}

// Boletos que muestran el QR: emitido y abordado (el usuario bus ya lo validó).
const CON_QR = ['emitido', 'abordado'];

function crearBoleto(boleto) {
    // Boleto emitido (o ya abordado, cambio 4.3): tarjeta con QR, descargable e imprimible.
    if (CON_QR.includes(boleto.estado) && boleto.codigo) {
        return crearBoletoImpreso(
            datosBoleto(boleto, datosViaje(), { origen: compra.origen ?? 'APP' }),
            { descargar: true }
        );
    }

    const tarjeta = document.createElement('div');
    tarjeta.className = 'card shadow-sm mb-3';

    const cuerpo = document.createElement('div');
    cuerpo.className = 'card-body';

    const fila = document.createElement('div');
    fila.className = 'd-flex justify-content-between align-items-start flex-wrap gap-2';

    const info = document.createElement('div');
    const asiento = document.createElement('h2');
    asiento.className = 'h5 mb-1';
    asiento.textContent = `Asiento ${boleto.numero_asiento}`;

    const pasajero = document.createElement('p');
    pasajero.className = 'mb-1';
    pasajero.textContent = `${boleto.pasajero_nombres} ${boleto.pasajero_apellidos}`;

    const cedula = document.createElement('p');
    cedula.className = 'text-muted small mb-0';
    cedula.textContent = `C.I. ${boleto.pasajero_cedula} · ${NOMBRES_TARIFA[boleto.tipo_pasajero] ?? boleto.tipo_pasajero}`;

    info.append(asiento, pasajero, cedula);

    const precio = document.createElement('div');
    precio.className = 'text-end';
    precio.textContent = dinero(boleto.precio);

    fila.append(info, precio);
    cuerpo.appendChild(fila);

    const espera = document.createElement('p');
    if (boleto.estado === 'anulado') {
        espera.className = 'alert alert-secondary small mt-3 mb-0';
        espera.textContent = 'Este boleto fue anulado y el asiento quedó libre.';
    } else {
        espera.className = 'alert alert-warning small mt-3 mb-0';
        espera.textContent = 'Tu asiento está reservado. El código QR se genera cuando un oficinista apruebe el pago.';
    }
    cuerpo.appendChild(espera);

    tarjeta.appendChild(cuerpo);
    return tarjeta;
}

function renderizarEstado() {
    const titulo = $('tituloBoleto');
    const badge = $('estadoCompra');
    const aviso = $('avisoCompra');

    badge.className = `badge ${claseEstado(compra.estado)}`;
    badge.textContent = nombreEstado(compra.estado);

    aviso.replaceChildren();
    aviso.className = 'alert';

    if (compra.estado === 'aprobada') {
        titulo.textContent = '¡Compra aprobada!';
        aviso.classList.add('alert-success');
        aviso.textContent = 'Presenta el código QR de cada boleto al momento de abordar el bus.';
    } else if (compra.estado === 'pendiente_comprobante') {
        titulo.textContent = 'Tu reserva está activa';
        aviso.classList.add('alert-warning');
        aviso.textContent = 'Falta subir el comprobante de pago. Tienes 3 horas desde la reserva.';

        const enlace = document.createElement('a');
        enlace.href = `pago.html?compra_id=${encodeURIComponent(compra.id)}`;
        enlace.className = 'btn btn-warning btn-sm ms-2';
        enlace.textContent = 'Subir comprobante';
        aviso.appendChild(enlace);
    } else if (compra.estado === 'pendiente_validacion') {
        titulo.textContent = 'Comprobante recibido';
        aviso.classList.add('alert-info');
        aviso.textContent = 'Un oficinista revisará tu comprobante. Te avisaremos cuando el pago sea aprobado.';
    } else if (compra.estado === 'rechazada') {
        titulo.textContent = 'Pago rechazado';
        aviso.classList.add('alert-danger');
        aviso.textContent = compra.motivo_rechazo
            ? `Motivo: ${compra.motivo_rechazo}`
            : 'El pago fue rechazado. Puedes volver a buscar un viaje.';
    } else {
        titulo.textContent = 'Reserva vencida';
        aviso.classList.add('alert-secondary');
        aviso.textContent = 'Pasaron las 3 horas para subir el comprobante y los asientos fueron liberados.';
    }
}

function renderizarBoletos() {
    const contenedor = $('listaBoletos');
    contenedor.replaceChildren();

    const emitidos = (compra.boletos ?? []).filter((b) => CON_QR.includes(b.estado) && b.codigo).length;
    $('btnImprimir').classList.toggle('d-none', emitidos === 0);
    $('notaImprimir').classList.toggle('d-none', emitidos === 0);

    if (!compra.boletos || compra.boletos.length === 0) {
        const vacio = document.createElement('p');
        vacio.className = 'text-muted';
        vacio.textContent = 'Esta compra no tiene boletos registrados.';
        contenedor.appendChild(vacio);
        return;
    }

    [...compra.boletos]
        .sort((a, b) => Number(a.numero_asiento) - Number(b.numero_asiento))
        .forEach((boleto) => contenedor.appendChild(crearBoleto(boleto)));
}

async function cargarCompra(compraId) {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Debes iniciar sesión.');

    const { data, error } = await supabase
        .from('compras')
        .select(`
            id, estado, origen, metodo_pago, subtotal, total, creado_en, vence_en, motivo_rechazo,
            viaje:viajes (
                fecha,
                frecuencia:frecuencias ( origen, destino, hora ),
                bus:buses ( placa, numero_interno, tipo_bus, cooperativa:cooperativas ( nombre ) )
            ),
            boletos ( numero_asiento, pasajero_cedula, pasajero_nombres, pasajero_apellidos,
                      tipo_pasajero, precio, estado, codigo )
        `)
        .eq('id', compraId)
        .eq('comprador_id', user.id)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('No se encontró la compra.');

    return data;
}

function dibujarCompra() {
    renderizarEstado();
    renderizarResumen();
    renderizarBoletos();
}

/**
 * Mientras el pago está pendiente, la página se actualiza sola cuando el
 * oficinista lo aprueba o rechaza (Realtime de compras, solo la compra propia).
 */
function escucharAprobacion(compraId) {
    if (canal || !['pendiente_comprobante', 'pendiente_validacion'].includes(compra.estado)) return;

    canal = supabase
        .channel(`compra-${compraId}`)
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'compras', filter: `id=eq.${compraId}` },
            async () => {
                try {
                    const antes = compra.estado;
                    compra = await cargarCompra(compraId);
                    dibujarCompra();

                    if (antes !== compra.estado && compra.estado === 'aprobada') {
                        mostrarAlerta('¡Tu pago fue aprobado! Ya tienes tus boletos con código QR.', 'success');
                    }
                    if (!['pendiente_comprobante', 'pendiente_validacion'].includes(compra.estado)) {
                        supabase.removeChannel(canal);
                        canal = null;
                    }
                } catch (error) {
                    console.error('No se pudo actualizar la compra:', error);
                }
            })
        .subscribe();
}

$('btnImprimir').addEventListener('click', () => window.print());

async function iniciar() {
    const rol = await exigirRoles(['cliente']);
    if (!rol) return;

    const params = new URLSearchParams(window.location.search);
    let compraId = params.get('compra_id') || params.get('id');

    if (!compraId) {
        try {
            compraId = JSON.parse(sessionStorage.getItem('compraActual') || 'null')?.id ?? null;
        } catch {
            compraId = null;
        }
    }

    if (!compraId) {
        mostrarAlerta('No se indicó la compra. Revisa tu historial de compras.', 'danger');
        $('contenidoCompra').classList.add('d-none');
        return;
    }

    try {
        compra = await cargarCompra(compraId);
        renderizarEstado();
        renderizarResumen();
        renderizarBoletos();
        escucharAprobacion(compraId);
    } catch (error) {
        console.error('No se pudo cargar el boleto:', error);
        mostrarAlerta(mensajeErrorBase(error, 'cargar el boleto'), 'danger');
        $('contenidoCompra').classList.add('d-none');
    }
}

iniciar();

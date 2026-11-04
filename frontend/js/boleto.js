import { supabase } from './supabaseClient.js';
import { exigirRoles } from './guardas.js';
import { mostrarAlerta } from './alertas.js';
import { dinero, formatearFecha, formatearHora } from './validaciones.js';

const $ = (id) => document.getElementById(id);

let compra = null;

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

function crearBoleto(boleto) {
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
    cedula.textContent = `C.I. ${boleto.pasajero_cedula} · ${boleto.tipo_pasajero}`;

    info.append(asiento, pasajero, cedula);

    const precio = document.createElement('div');
    precio.className = 'text-end';
    precio.textContent = dinero(boleto.precio);

    fila.append(info, precio);
    cuerpo.appendChild(fila);

    if (boleto.estado === 'emitido' && boleto.codigo) {
        const codigo = document.createElement('p');
        codigo.className = 'fw-bold text-center mt-3 mb-2';
        codigo.textContent = `Código: ${boleto.codigo}`;

        const qr = document.createElement('div');
        qr.className = 'd-flex justify-content-center';
        qr.id = `qr-${boleto.numero_asiento}`;

        const acciones = document.createElement('div');
        acciones.className = 'd-grid mt-3';

        const btnDescargar = document.createElement('button');
        btnDescargar.type = 'button';
        btnDescargar.className = 'btn btn-outline-primary btn-sm';
        btnDescargar.textContent = 'Descargar código QR';
        btnDescargar.addEventListener('click', () => descargarQR(qr, boleto.codigo));

        acciones.appendChild(btnDescargar);
        cuerpo.append(codigo, qr, acciones);

        // Se genera después de insertar el QR en el documento.
        setTimeout(() => {
            new QRCode(qr, {
                text: boleto.codigo,
                width: 180,
                height: 180,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H,
            });
        }, 0);
    } else {
        const espera = document.createElement('p');
        espera.className = 'alert alert-warning small mt-3 mb-0';
        espera.textContent = 'Tu asiento está reservado. El código QR se genera cuando un oficinista apruebe el pago.';
        cuerpo.appendChild(espera);
    }

    tarjeta.appendChild(cuerpo);
    return tarjeta;
}

function descargarQR(contenedor, codigo) {
    const canvas = contenedor.querySelector('canvas');
    const img = contenedor.querySelector('img');
    const url = canvas ? canvas.toDataURL('image/png') : img?.src;

    if (!url) return;

    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `boleto_${codigo}.png`;
    enlace.click();
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
            id, estado, metodo_pago, subtotal, total, creado_en, vence_en, motivo_rechazo,
            viaje:viajes (
                fecha,
                frecuencia:frecuencias ( origen, destino, hora ),
                bus:buses ( placa, tipo_bus, cooperativa:cooperativas ( nombre ) )
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
    } catch (error) {
        console.error('No se pudo cargar el boleto:', error);
        mostrarAlerta(error.message || 'No se pudo cargar el boleto.', 'danger');
        $('contenidoCompra').classList.add('d-none');
    }
}

iniciar();

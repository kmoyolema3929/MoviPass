import { supabase } from './supabaseClient.js';
import { exigirRoles } from './guardas.js';
import { mostrarAlerta } from './alertas.js';
import { dinero, formatearFecha, formatearHora } from './validaciones.js';

const $ = (id) => document.getElementById(id);
const TAMANO_MAXIMO = 5 * 1024 * 1024;
const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

let compra = null;
let compraId = null;

function nombreEstado(estado) {
    return {
        pendiente_comprobante: 'Esperando comprobante',
        pendiente_validacion: 'Comprobante en validación',
        aprobada: 'Pago aprobado',
        rechazada: 'Pago rechazado',
        vencida: 'Reserva vencida',
    }[estado] ?? estado;
}

function textoFechaHora(valor) {
    if (!valor) return '—';
    try {
        return new Date(valor).toLocaleString('es-EC');
    } catch {
        return String(valor);
    }
}

function renderizarCompra() {
    const { viaje } = compra;

    const contenedor = $('resumenCompra');
    contenedor.replaceChildren();

    const frecuencia = viaje?.frecuencia;

    const filas = [
        ['Ruta', frecuencia ? `${frecuencia.origen} → ${frecuencia.destino}` : '—'],
        ['Fecha', viaje ? formatearFecha(viaje.fecha) : '—'],
        ['Hora', frecuencia ? formatearHora(frecuencia.hora) : '—'],
        ['Cooperativa', viaje?.bus?.cooperativa?.nombre ?? '—'],
        ['Método de pago', compra.metodo_pago === 'deposito' ? 'Depósito' : 'Transferencia'],
        ['Asientos', String(compra.boletos?.length ?? 0)],
        ['Total', dinero(compra.total)],
        ['Estado', nombreEstado(compra.estado)],
    ];

    if (compra.estado === 'pendiente_comprobante' && compra.vence_en) {
        filas.push(['Sube tu comprobante antes de', textoFechaHora(compra.vence_en)]);
    }

    const dl = document.createElement('dl');
    dl.className = 'row mb-0';

    filas.forEach(([etiqueta, valor]) => {
        const dt = document.createElement('dt');
        dt.className = 'col-5 col-sm-4';
        dt.textContent = etiqueta;

        const dd = document.createElement('dd');
        dd.className = 'col-7 col-sm-8 text-break';
        dd.textContent = valor;

        dl.append(dt, dd);
    });

    contenedor.appendChild(dl);
}

async function cargarCompra() {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Debes iniciar sesión.');

    const { data, error } = await supabase
        .from('compras')
        .select(`
            id, estado, metodo_pago, subtotal, total, vence_en, creado_en,
            motivo_rechazo, comprobante_ruta,
            viaje:viajes (
                fecha,
                frecuencia:frecuencias ( origen, destino, hora ),
                bus:buses ( placa, tipo_bus, cooperativa:cooperativas ( nombre ) )
            ),
            boletos ( numero_asiento, pasajero_nombres, pasajero_apellidos, precio, estado, codigo )
        `)
        .eq('id', compraId)
        .eq('comprador_id', user.id)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('No se encontró la compra.');

    compra = data;
}

function ajustarFormulario() {
    const form = $('formPago');
    const aviso = $('avisoEstado');

    if (compra.estado === 'pendiente_comprobante') {
        form.classList.remove('d-none');
        aviso.classList.add('d-none');
        return;
    }

    form.classList.add('d-none');
    aviso.classList.remove('d-none');
    aviso.replaceChildren();

    const mensaje = document.createElement('p');
    mensaje.className = 'mb-2';
    mensaje.textContent = `Esta compra está en estado: ${nombreEstado(compra.estado)}. Ya no admite un comprobante nuevo.`;

    const enlace = document.createElement('a');
    enlace.href = `boleto.html?compra_id=${encodeURIComponent(compra.id)}`;
    enlace.className = 'btn btn-outline-primary btn-sm';
    enlace.textContent = 'Ver el detalle de mi compra';

    aviso.append(mensaje);

    if (compra.estado === 'rechazada' && compra.motivo_rechazo) {
        const motivo = document.createElement('p');
        motivo.className = 'alert alert-danger small';
        motivo.textContent = `Motivo del rechazo: ${compra.motivo_rechazo}`;
        aviso.appendChild(motivo);
    }

    aviso.appendChild(enlace);
}

async function subirComprobante(evento) {
    evento.preventDefault();

    const input = $('comprobante');
    const boton = $('btnSubirPago');
    const archivo = input.files?.[0];

    if (!archivo) {
        mostrarAlerta('Selecciona un archivo de comprobante.', 'warning');
        return;
    }

    if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
        mostrarAlerta('El comprobante debe ser una imagen JPG, PNG, WEBP o un PDF.', 'danger');
        return;
    }

    if (archivo.size > TAMANO_MAXIMO) {
        mostrarAlerta('El archivo no puede superar los 5 MB.', 'danger');
        return;
    }

    const textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Subiendo comprobante...';

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Debes iniciar sesión.');

        const nombreSeguro = archivo.name.replace(/[^\w.\-]+/g, '_');
        const ruta = `${user.id}/${compra.id}/${Date.now()}_${nombreSeguro}`;

        const { error: errorSubida } = await supabase.storage
            .from('comprobantes')
            .upload(ruta, archivo, {
                contentType: archivo.type,
                upsert: false,
            });

        if (errorSubida) throw errorSubida;

        const { error: errorRegistro } = await supabase.rpc('registrar_comprobante', {
            p_compra_id: compra.id,
            p_ruta: ruta,
        });

        if (errorRegistro) throw errorRegistro;

        sessionStorage.setItem('compraActual', JSON.stringify({
            id: compra.id,
            total: Number(compra.total),
            vence_en: null,
        }));

        mostrarAlerta('Comprobante subido. Ahora un oficinista validará tu pago.', 'success');

        setTimeout(() => {
            window.location.href = `boleto.html?compra_id=${encodeURIComponent(compra.id)}`;
        }, 1200);
    } catch (error) {
        console.error('No se pudo subir el comprobante:', error);
        mostrarAlerta(
            error.message || 'No se pudo subir el comprobante. Inténtalo de nuevo.',
            'danger'
        );
    } finally {
        boton.disabled = false;
        boton.textContent = textoOriginal;
    }
}

async function iniciar() {
    const rol = await exigirRoles(['cliente']);
    if (!rol) return;

    const params = new URLSearchParams(window.location.search);
    compraId = params.get('compra_id');

    if (!compraId) {
        try {
            compraId = JSON.parse(sessionStorage.getItem('compraActual') || 'null')?.id ?? null;
        } catch {
            compraId = null;
        }
    }

    if (!compraId) {
        mostrarAlerta('No se indicó la compra. Revisa tu historial de compras.', 'danger');
        $('formPago').classList.add('d-none');
        $('resumenCompra').appendChild(
            Object.assign(document.createElement('a'), {
                href: 'historial.html',
                className: 'btn btn-primary btn-sm',
                textContent: 'Ir a mis compras',
            })
        );
        return;
    }

    try {
        await cargarCompra();
        renderizarCompra();
        ajustarFormulario();
        $('formPago').addEventListener('submit', subirComprobante);
    } catch (error) {
        console.error('No se pudo cargar la compra:', error);
        mostrarAlerta(error.message || 'No se pudo cargar la compra.', 'danger');
        $('formPago').classList.add('d-none');
    }
}

iniciar();

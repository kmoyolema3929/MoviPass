import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { obtenerContextoGestion, textoError } from '../../js/contextoUsuario.js';
import { mostrarAlerta } from '../../js/alertas.js';
import { formatearFecha, formatearHora, dinero } from '../../js/validaciones.js'; // <-- Ruta corregida

const COLUMNAS = `
    id, metodo_pago, estado, total, comprobante_ruta, comprobante_subido_en, creado_en, vence_en,
    viajes ( fecha, frecuencias ( origen, destino, hora ), buses ( placa ) ),
    boletos ( numero_asiento, pasajero_nombres, pasajero_apellidos, pasajero_cedula, tipo_pasajero, precio, estado )
`;

const $ = (id) => document.getElementById(id);
const modalComprobante = bootstrap.Modal.getOrCreateInstance($('modalComprobante'));
const modalRechazo = bootstrap.Modal.getOrCreateInstance($('modalRechazo'));

let idsCooperativas = [];
let compraARechazar = null;

const METODOS = { deposito: 'Depósito', transferencia: 'Transferencia', efectivo: 'Efectivo' };

function elemento(etiqueta, clase, texto) {
    const el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    if (texto !== undefined) el.textContent = texto;
    return el;
}

function descripcionViaje(compra) {
    const v = compra.viajes;
    if (!v) return 'Viaje no disponible';
    return `${v.frecuencias.origen} → ${v.frecuencias.destino} · ${formatearFecha(v.fecha)} ${formatearHora(v.frecuencias.hora)}`;
}

function boletosActivos(compra) {
    return (compra.boletos ?? [])
        .filter((b) => b.estado !== 'anulado')
        .sort((a, b) => a.numero_asiento - b.numero_asiento);
}

function haceCuanto(fechaISO) {
    const minutos = Math.max(0, Math.round((Date.now() - new Date(fechaISO).getTime()) / 60000));
    if (minutos < 1) return 'hace un momento';
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `hace ${horas} h`;
    return `hace ${Math.floor(horas / 24)} d`;
}

function enCuanto(fechaISO) {
    const minutos = Math.round((new Date(fechaISO).getTime() - Date.now()) / 60000);
    if (minutos <= 0) return 'vencida';
    if (minutos < 60) return `en ${minutos} min`;
    return `en ${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

async function cargar() {
    const [pendientes, espera] = await Promise.all([
        supabase.from('compras').select(COLUMNAS)
            .eq('estado', 'pendiente_validacion')
            .in('cooperativa_id', idsCooperativas)
            .order('comprobante_subido_en', { ascending: true }),
        supabase.from('compras').select(COLUMNAS)
            .eq('estado', 'pendiente_comprobante')
            .in('cooperativa_id', idsCooperativas)
            .order('vence_en', { ascending: true })
    ]);

    if (pendientes.error) throw pendientes.error;
    if (espera.error) throw espera.error;

    dibujarPendientes(pendientes.data ?? []);
    dibujarEspera(espera.data ?? []);
}

function dibujarPendientes(compras) {
    const lista = $('listaPendientes');
    lista.replaceChildren();
    $('contadorPendientes').textContent = compras.length;

    if (compras.length === 0) {
        lista.appendChild(elemento('p', 'text-muted', 'No hay pagos pendientes de validación.'));
        return;
    }

    compras.forEach((compra) => {
        const tarjeta = elemento('div', 'card shadow-sm mb-3');
        const cuerpo = elemento('div', 'card-body');

        const cabecera = elemento('div', 'd-flex flex-wrap justify-content-between gap-2 mb-2');
        const izquierda = elemento('div');
        izquierda.append(
            elemento('div', 'h6 mb-1', descripcionViaje(compra)),
            elemento('div', 'small text-muted',
                `Bus ${compra.viajes?.buses?.placa ?? '-'} · Comprobante subido ${haceCuanto(compra.comprobante_subido_en)}`)
        );
        const derecha = elemento('div', 'text-end');
        derecha.append(
            elemento('span', 'badge bg-info text-dark me-2', METODOS[compra.metodo_pago] ?? compra.metodo_pago),
            elemento('span', 'fw-bold fs-5', dinero(compra.total))
        );
        cabecera.append(izquierda, derecha);

        const tabla = elemento('table', 'table table-sm mb-3');
        const cuerpoTabla = elemento('tbody');
        boletosActivos(compra).forEach((b) => {
            const tr = elemento('tr');
            tr.append(
                elemento('td', '', `Asiento ${b.numero_asiento}`),
                elemento('td', '', `${b.pasajero_nombres} ${b.pasajero_apellidos}`),
                elemento('td', '', `C.I. ${b.pasajero_cedula}`),
                elemento('td', 'text-end', dinero(b.precio))
            );
            cuerpoTabla.appendChild(tr);
        });
        tabla.appendChild(cuerpoTabla);

        const acciones = elemento('div', 'd-flex flex-wrap gap-2');

        const btnVer = elemento('button', 'btn btn-outline-primary', 'Ver comprobante');
        btnVer.type = 'button';
        btnVer.addEventListener('click', () => verComprobante(compra, btnVer));

        const btnAprobar = elemento('button', 'btn btn-success', 'Aprobar y emitir boletos');
        btnAprobar.type = 'button';
        btnAprobar.addEventListener('click', () => aprobar(compra, btnAprobar));

        const btnRechazar = elemento('button', 'btn btn-outline-danger', 'Rechazar');
        btnRechazar.type = 'button';
        btnRechazar.addEventListener('click', () => abrirRechazo(compra));

        acciones.append(btnVer, btnAprobar, btnRechazar);
        cuerpo.append(cabecera, tabla, acciones);
        tarjeta.appendChild(cuerpo);
        lista.appendChild(tarjeta);
    });
}

function dibujarEspera(compras) {
    const tbody = $('tablaEspera');
    tbody.replaceChildren();
    $('contadorEspera').textContent = compras.length;

    if (compras.length === 0) {
        const tr = elemento('tr');
        const td = elemento('td', 'text-center text-muted py-3', 'No hay compras esperando comprobante.');
        td.colSpan = 5;
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    compras.forEach((compra) => {
        const tr = elemento('tr');
        tr.append(
            elemento('td', '', descripcionViaje(compra)),
            elemento('td', '', boletosActivos(compra).map((b) => b.numero_asiento).join(', ')),
            elemento('td', '', METODOS[compra.metodo_pago] ?? compra.metodo_pago),
            elemento('td', '', dinero(compra.total)),
            elemento('td', '', compra.vence_en ? enCuanto(compra.vence_en) : '-')
        );
        tbody.appendChild(tr);
    });
}

async function verComprobante(compra, boton) {
    boton.disabled = true;

    try {
        const { data, error } = await supabase.storage
            .from('comprobantes')
            .createSignedUrl(compra.comprobante_ruta, 300);

        if (error) throw error;

        const contenido = $('contenidoComprobante');
        contenido.replaceChildren();

        if (compra.comprobante_ruta.toLowerCase().endsWith('.pdf')) {
            const marco = document.createElement('iframe');
            marco.src = data.signedUrl;
            marco.title = 'Comprobante de pago';
            marco.style.width = '100%';
            marco.style.height = '70vh';
            marco.style.border = '0';
            contenido.appendChild(marco);
        } else {
            const imagen = document.createElement('img');
            imagen.src = data.signedUrl;
            imagen.alt = 'Comprobante de pago';
            imagen.className = 'img-fluid';
            contenido.appendChild(imagen);
        }

        $('enlaceComprobante').href = data.signedUrl;
        modalComprobante.show();
    } catch (error) {
        console.error('No se pudo abrir el comprobante:', error);
        mostrarAlerta('No se pudo abrir el comprobante. ' + (error.message ?? ''), 'danger');
    } finally {
        boton.disabled = false;
    }
}

$('modalComprobante').addEventListener('hidden.bs.modal', () => {
    $('contenidoComprobante').replaceChildren(); // se borra el enlace temporal
});

/* ---------- Aprobar / rechazar ---------- */

async function aprobar(compra, boton) {
    const asientos = boletosActivos(compra).map((b) => b.numero_asiento).join(', ');
    if (!confirm(`¿Confirmas que recibiste ${dinero(compra.total)}?\nSe emitirán los boletos de los asientos: ${asientos}.`)) return;

    boton.disabled = true;

    try {
        const { error } = await supabase.rpc('aprobar_pago', { p_compra_id: compra.id });
        if (error) throw error;

        mostrarAlerta('Pago aprobado. Los boletos fueron emitidos.', 'success');
    } catch (error) {
        console.error('Error al aprobar el pago:', error);
        mostrarAlerta(textoError(error), 'danger');
    } finally {
        await recargar();
    }
}

function abrirRechazo(compra) {
    compraARechazar = compra;
    $('motivoRechazo').value = '';
    $('motivoRechazo').classList.remove('is-invalid');
    modalRechazo.show();
}

$('btnConfirmarRechazo').addEventListener('click', async () => {
    const motivo = $('motivoRechazo').value.trim();

    if (motivo.length < 3) {
        $('motivoRechazo').classList.add('is-invalid');
        return;
    }
    if (!compraARechazar) return;

    const boton = $('btnConfirmarRechazo');
    boton.disabled = true;

    try {
        const { error } = await supabase.rpc('rechazar_pago', {
            p_compra_id: compraARechazar.id,
            p_motivo: motivo
        });
        if (error) throw error;

        modalRechazo.hide();
        mostrarAlerta('Pago rechazado. Los asientos quedaron libres.', 'success');
    } catch (error) {
        console.error('Error al rechazar el pago:', error);
        modalRechazo.hide();
        mostrarAlerta(textoError(error), 'danger');
    } finally {
        compraARechazar = null;
        boton.disabled = false;
        await recargar();
    }
});

/* ---------- Inicio ---------- */

async function recargar() {
    try {
        await cargar();
    } catch (error) {
        console.error('Error al cargar los pagos:', error);
        $('listaPendientes').replaceChildren(elemento('p', 'text-danger', 'No se pudieron cargar los pagos.'));
        mostrarAlerta(textoError(error), 'danger');
    }
}

$('btnActualizar').addEventListener('click', recargar);

async function iniciar() {
    const rol = await exigirRoles(['oficinista']);
    if (!rol) return;

    try {
        const { cooperativas } = await obtenerContextoGestion();
        idsCooperativas = cooperativas.map((c) => c.id);

        if (idsCooperativas.length === 0) {
            $('listaPendientes').replaceChildren(
                elemento('p', 'text-danger', 'Tu cuenta aún no está asignada a una cooperativa. Contacta al administrador.')
            );
            return;
        }

        await recargar();
        setInterval(recargar, 60000); // se actualiza sola cada minuto
    } catch (error) {
        console.error('Error al iniciar:', error);
        mostrarAlerta(textoError(error), 'danger');
    }
}

iniciar();
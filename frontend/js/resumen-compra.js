import { supabase } from './supabaseClient.js';
import { exigirRoles } from './guardas.js';
import { mostrarAlerta } from './alertas.js';
import { dinero, formatearFecha, formatearHora } from './validaciones.js';
import { ponerOpciones } from './combos.js';
import {
    LIMITES_COMPRA, pasajeroParaEnviar, puedeAutocompletar, resumenCobro, revisarPasajero
} from './reglasCompra.js';
import { revisarCedula } from './reglasCuenta.js';
import { textoBus } from './reglasOperacion.js';
import { mensajeErrorBase } from './erroresBase.js';

const $ = (id) => document.getElementById(id);

let borrador = null;
const datos = new Map();

/** Resumen del cobro con la tarifa de cada pasajero (igual que la base). */
function resumenActual() {
    return resumenCobro(
        borrador.viaje.precio,
        borrador.asientos.map((numero) => ({ numero_asiento: numero, tipo: datos.get(numero)?.tipo ?? 'normal' })),
        borrador.tipos
    );
}

/**
 * Autocompleta nombres y apellidos de un acompañante con las compras de esta
 * cuenta (pasajero_de_mis_compras). Nunca muestra datos de otras cuentas.
 */
async function autocompletar(numero, campos) {
    const d = datos.get(numero);
    const cedula = d.cedula;
    if (cedula.length !== 10 || revisarCedula(cedula) || !puedeAutocompletar(d)) return;

    const { data, error } = await supabase.rpc('pasajero_de_mis_compras', { p_cedula: cedula });

    // Si mientras tanto cambió la cédula o el cliente escribió, no se toca nada.
    if (error || !data || d.cedula !== cedula || !puedeAutocompletar(d)) {
        if (error) console.warn('No se pudo autocompletar el pasajero:', error);
        return;
    }

    d.nombres = data.nombres ?? '';
    d.apellidos = data.apellidos ?? '';
    d.autocompletado = true;
    campos.nombres.value = d.nombres;
    campos.apellidos.value = d.apellidos;
    campos.nombres.classList.remove('is-invalid');
    campos.apellidos.classList.remove('is-invalid');
    campos.ayuda.textContent = 'Datos de tus compras anteriores. Revísalos o corrígelos.';
}

function renderizarViaje() {
    const { viaje } = borrador;
    $('rutaViaje').textContent = `${viaje.origen} → ${viaje.destino}`;
    $('fechaViaje').textContent = formatearFecha(viaje.fecha);
    $('horaViaje').textContent = formatearHora(viaje.hora);
    $('busViaje').textContent = `${textoBus({ numero_interno: viaje.busNumero, placa: viaje.busPlaca })} · ${viaje.tipoBus}`;
    $('cooperativaViaje').textContent = viaje.cooperativaNombre;
}

function crearCampo(etiqueta, id, atributos = {}) {
    const col = document.createElement('div');
    col.className = atributos.col ?? 'col-md-6';

    const label = document.createElement('label');
    label.className = 'form-label small mb-1';
    label.htmlFor = id;
    label.textContent = etiqueta;

    const input = document.createElement('input');
    input.className = 'form-control form-control-sm';
    input.id = id;
    input.type = 'text';
    input.required = true;
    input.maxLength = atributos.maxLength ?? LIMITES_COMPRA.nombre;
    if (atributos.inputMode) input.inputMode = atributos.inputMode;
    input.autocomplete = atributos.autocomplete ?? 'off';

    // Mensaje junto al campo.
    const aviso = document.createElement('div');
    aviso.className = 'invalid-feedback';
    aviso.id = `${id}-error`;
    input.setAttribute('aria-describedby', aviso.id);

    col.append(label, input, aviso);
    return { col, input };
}

/** Marca un campo con su problema ('' lo limpia). */
function marcarCampo(id, problema) {
    const campo = $(id);
    if (!campo) return;
    campo.classList.toggle('is-invalid', Boolean(problema));
    const aviso = $(`${id}-error`);
    if (aviso) aviso.textContent = problema;
}

function dibujarPasajeros() {
    const contenedor = $('listaPasajeros');
    contenedor.replaceChildren();

    borrador.asientos.forEach((numero, indice) => {
        const d = { cedula: '', nombres: '', apellidos: '', tipo: 'normal', autocompletado: false };
        datos.set(numero, d);

        const tarjeta = document.createElement('fieldset');
        tarjeta.className = 'border rounded p-3 mb-3';
        tarjeta.dataset.asiento = String(numero);

        const leyenda = document.createElement('legend');
        leyenda.className = 'h6 float-none w-auto px-2 mb-2';
        leyenda.textContent = `Pasajero ${indice + 1} · Asiento ${numero}`;

        const fila = document.createElement('div');
        fila.className = 'row g-2';

        const cedula = crearCampo('Cédula *', `cedula-${numero}`, {
            maxLength: 10,
            inputMode: 'numeric',
        });
        const ayuda = document.createElement('div');
        ayuda.className = 'form-text';
        ayuda.id = `cedula-${numero}-ayuda`;
        ayuda.setAttribute('aria-live', 'polite');
        cedula.col.appendChild(ayuda);
        cedula.input.setAttribute('aria-describedby', `cedula-${numero}-error ${ayuda.id}`);

        const nombres = crearCampo('Nombres *', `nombres-${numero}`);
        const apellidos = crearCampo('Apellidos *', `apellidos-${numero}`);

        const colTipo = document.createElement('div');
        colTipo.className = 'col-md-6';
        const labelTipo = document.createElement('label');
        labelTipo.className = 'form-label small mb-1';
        labelTipo.htmlFor = `tipo-${numero}`;
        labelTipo.textContent = 'Tipo de pasajero *';
        const selectTipo = document.createElement('select');
        selectTipo.className = 'form-select form-select-sm';
        selectTipo.id = `tipo-${numero}`;

        // "Adulto" (normal, tarifa completa) por defecto: no lleva opción "Selecciona...".
        ponerOpciones(selectTipo, borrador.tipos, {
            valor: (tipo) => tipo.codigo,
            texto: (tipo) => (Number(tipo.descuento) > 0
                ? `${tipo.nombre} (${Number(tipo.descuento)}% desc.)`
                : tipo.nombre),
            inicial: null,
            porDefecto: d.tipo || 'normal',
            vacio: 'No hay tipos de pasajero',
        });
        colTipo.append(labelTipo, selectTipo);

        cedula.input.addEventListener('input', () => {
            cedula.input.value = cedula.input.value.replace(/\D/g, '');
            d.cedula = cedula.input.value;
            cedula.input.classList.remove('is-invalid');
            ayuda.textContent = '';
            autocompletar(numero, { nombres: nombres.input, apellidos: apellidos.input, ayuda });
        });

        nombres.input.addEventListener('input', () => {
            d.nombres = nombres.input.value;
            d.autocompletado = false; // lo que escribe el cliente no se pisa
            nombres.input.classList.remove('is-invalid');
        });

        apellidos.input.addEventListener('input', () => {
            d.apellidos = apellidos.input.value;
            d.autocompletado = false;
            apellidos.input.classList.remove('is-invalid');
        });

        selectTipo.addEventListener('change', () => {
            d.tipo = selectTipo.value;
            actualizarResumen();
        });

        fila.append(cedula.col, colTipo, nombres.col, apellidos.col);
        tarjeta.append(leyenda, fila);
        contenedor.appendChild(tarjeta);
    });
}

function actualizarResumen() {
    const lista = $('listaAsientosResumen');
    lista.replaceChildren();

    const resumen = resumenActual();

    resumen.lineas.forEach((l) => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between px-0';

        const detalle = document.createElement('span');
        detalle.textContent = `Asiento ${l.numero_asiento} · ${l.tarifa}${l.descuento > 0 ? ` (−${l.descuento}%)` : ''}`;

        const valor = document.createElement('span');
        valor.textContent = dinero(l.precio);

        li.append(detalle, valor);
        lista.appendChild(li);
    });

    $('tarifaNormal').textContent = dinero(borrador.viaje.precio);
    $('subtotalPagar').textContent = dinero(resumen.subtotal);
    $('descuentoPagar').textContent = resumen.descuento > 0 ? `−${dinero(resumen.descuento)}` : dinero(0);

    const totalEl = $('totalPagar');
    totalEl.textContent = dinero(resumen.total);
    totalEl.dataset.total = String(resumen.total);
}

function validarPasajeros() {
    let primerError = null;

    borrador.asientos.forEach((numero) => {
        const errores = revisarPasajero(datos.get(numero));

        ['cedula', 'nombres', 'apellidos'].forEach((campo) => {
            const id = `${campo}-${numero}`;
            marcarCampo(id, errores[campo] ?? '');
            if (errores[campo] && !primerError) primerError = $(id);
        });
    });

    primerError?.focus();
    return !primerError;
}

function metodoElegido() {
    const metodo = document.querySelector('input[name="metodoPago"]:checked')?.value ?? '';
    const aviso = $('errorMetodoPago');

    document.querySelectorAll('input[name="metodoPago"]')
        .forEach((radio) => radio.classList.toggle('is-invalid', !metodo));
    if (aviso) aviso.textContent = metodo ? '' : 'Elige cómo vas a pagar.';

    return metodo;
}

let reservando = false;

async function confirmarCompra(evento) {
    evento.preventDefault();

    if (reservando) return;

    const metodo = metodoElegido();
    const pasajerosValidos = validarPasajeros();

    if (!metodo) {
        if (pasajerosValidos) document.querySelector('input[name="metodoPago"]')?.focus();
        return;
    }
    if (!pasajerosValidos) return;

    const pasajeros = borrador.asientos.map((numero) => pasajeroParaEnviar(numero, datos.get(numero)));

    const boton = $('btnContinuarPago');
    const textoOriginal = boton.textContent;

    reservando = true;
    boton.disabled = true;
    boton.textContent = 'Reservando asientos...';

    try {
        const { data, error } = await supabase.rpc('crear_compra_cliente', {
            p_viaje_id: borrador.viaje.id,
            p_metodo: metodo,
            p_pasajeros: pasajeros,
        });

        if (error) throw error;

        const compraActual = {
            id: data.compra_id,
            total: Number(data.total),
            vence_en: data.vence_en,
            ...borrador,
        };

        sessionStorage.setItem('compraActual', JSON.stringify(compraActual));
        sessionStorage.removeItem('compraDraft');

        // Redirigiendo: el botón queda bloqueado para no reservar dos veces.
        window.location.href = `pago.html?compra_id=${encodeURIComponent(data.compra_id)}`;
    } catch (error) {
        console.error('No se pudo crear la compra:', error);
        mostrarAlerta(mensajeErrorBase(error, 'reservar los asientos'), 'danger');
        boton.textContent = textoOriginal;
        boton.disabled = false;
        reservando = false;
    }
}

async function iniciar() {
    const rol = await exigirRoles(['cliente']);
    if (!rol) return;

    const guardado = sessionStorage.getItem('compraDraft');

    if (!guardado) {
        document.querySelector('main').insertAdjacentHTML(
            'afterbegin',
            '<div class="alert alert-warning">No hay una selección de asientos activa. Vuelve a buscar tu viaje.</div>'
        );
        $('formCompra').classList.add('d-none');
        return;
    }

    try {
        borrador = JSON.parse(guardado);
    } catch (error) {
        console.error('El borrador de compra no es válido:', error);
        borrador = null;
    }

    if (
        !borrador?.viaje?.id ||
        !Array.isArray(borrador.asientos) ||
        borrador.asientos.length === 0 ||
        !Array.isArray(borrador.tipos)
    ) {
        mostrarAlerta('La selección de asientos ya no es válida. Vuelve a elegir tus asientos.', 'danger');
        $('formCompra').classList.add('d-none');
        return;
    }

    renderizarViaje();
    dibujarPasajeros();
    actualizarResumen();

    $('formCompra').addEventListener('submit', confirmarCompra);
    document.querySelectorAll('input[name="metodoPago"]')
        .forEach((radio) => radio.addEventListener('change', metodoElegido));
}

iniciar();

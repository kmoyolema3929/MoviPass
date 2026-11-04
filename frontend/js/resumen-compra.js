import { supabase } from './supabaseClient.js';
import { exigirRoles } from './guardas.js';
import { mostrarAlerta } from './alertas.js';
import { cedulaValida, dinero, formatearFecha, formatearHora } from './validaciones.js';

const $ = (id) => document.getElementById(id);

let borrador = null;
const datos = new Map();

function precioConDescuento(tipoCodigo) {
    const tipo = borrador.tipos.find((t) => t.codigo === tipoCodigo);
    const descuento = tipo ? Number(tipo.descuento) : 0;
    return Math.round(borrador.viaje.precio * (100 - descuento)) / 100;
}

function nombreTipo(tipoCodigo) {
    return borrador.tipos.find((t) => t.codigo === tipoCodigo)?.nombre ?? tipoCodigo;
}

function renderizarViaje() {
    const { viaje } = borrador;
    $('rutaViaje').textContent = `${viaje.origen} → ${viaje.destino}`;
    $('fechaViaje').textContent = formatearFecha(viaje.fecha);
    $('horaViaje').textContent = formatearHora(viaje.hora);
    $('busViaje').textContent = `${viaje.busPlaca} · ${viaje.tipoBus}`;
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
    if (atributos.maxLength) input.maxLength = atributos.maxLength;
    if (atributos.inputMode) input.inputMode = atributos.inputMode;
    input.autocomplete = atributos.autocomplete ?? 'off';

    col.append(label, input);
    return { col, input };
}

function dibujarPasajeros() {
    const contenedor = $('listaPasajeros');
    contenedor.replaceChildren();

    borrador.asientos.forEach((numero) => {
        const d = { cedula: '', nombres: '', apellidos: '', tipo: 'normal' };
        datos.set(numero, d);

        const tarjeta = document.createElement('fieldset');
        tarjeta.className = 'border rounded p-3 mb-3';
        tarjeta.dataset.asiento = String(numero);

        const leyenda = document.createElement('legend');
        leyenda.className = 'h6 float-none w-auto px-2 mb-2';
        leyenda.textContent = `Asiento ${numero}`;

        const fila = document.createElement('div');
        fila.className = 'row g-2';

        const cedula = crearCampo('Cédula', `cedula-${numero}`, {
            maxLength: 10,
            inputMode: 'numeric',
        });
        const nombres = crearCampo('Nombres', `nombres-${numero}`);
        const apellidos = crearCampo('Apellidos', `apellidos-${numero}`);

        const colTipo = document.createElement('div');
        colTipo.className = 'col-md-6';
        const labelTipo = document.createElement('label');
        labelTipo.className = 'form-label small mb-1';
        labelTipo.htmlFor = `tipo-${numero}`;
        labelTipo.textContent = 'Tipo de pasajero';
        const selectTipo = document.createElement('select');
        selectTipo.className = 'form-select form-select-sm';
        selectTipo.id = `tipo-${numero}`;

        borrador.tipos.forEach((tipo) => {
            const opcion = document.createElement('option');
            opcion.value = tipo.codigo;
            opcion.textContent = Number(tipo.descuento) > 0
                ? `${tipo.nombre} (${Number(tipo.descuento)}% desc.)`
                : tipo.nombre;
            selectTipo.appendChild(opcion);
        });
        selectTipo.value = d.tipo;
        colTipo.append(labelTipo, selectTipo);

        cedula.input.addEventListener('input', () => {
            cedula.input.value = cedula.input.value.replace(/\D/g, '');
            d.cedula = cedula.input.value;
            cedula.input.classList.remove('is-invalid');
        });

        nombres.input.addEventListener('input', () => {
            d.nombres = nombres.input.value;
            nombres.input.classList.remove('is-invalid');
        });

        apellidos.input.addEventListener('input', () => {
            d.apellidos = apellidos.input.value;
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

    let total = 0;

    borrador.asientos.forEach((numero) => {
        const d = datos.get(numero) ?? { tipo: 'normal' };
        const precio = precioConDescuento(d.tipo);
        total += precio;

        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between px-0';

        const detalle = document.createElement('span');
        detalle.textContent = `Asiento ${numero} · ${nombreTipo(d.tipo)}`;

        const valor = document.createElement('span');
        valor.textContent = dinero(precio);

        li.append(detalle, valor);
        lista.appendChild(li);
    });

    const totalEl = $('totalPagar');
    totalEl.textContent = dinero(total);
    totalEl.dataset.total = String(total);
}

function validarPasajeros() {
    let primerError = null;

    borrador.asientos.forEach((numero) => {
        const d = datos.get(numero);
        const revisar = (ok, id) => {
            const campo = $(id);
            if (!campo) return;
            campo.classList.toggle('is-invalid', !ok);
            if (!ok && !primerError) primerError = campo;
        };

        revisar(cedulaValida(d.cedula.trim()), `cedula-${numero}`);
        revisar(d.nombres.trim().length >= 2, `nombres-${numero}`);
        revisar(d.apellidos.trim().length >= 2, `apellidos-${numero}`);
    });

    if (primerError) {
        primerError.focus();
        mostrarAlerta('Revisa los datos marcados en rojo.', 'warning');
        return false;
    }

    return true;
}

async function confirmarCompra(evento) {
    evento.preventDefault();

    if (!validarPasajeros()) return;

    const metodo = document.querySelector('input[name="metodoPago"]:checked')?.value;

    if (!metodo) {
        mostrarAlerta('Selecciona el método de pago.', 'warning');
        return;
    }

    const pasajeros = borrador.asientos.map((numero) => {
        const d = datos.get(numero);
        return {
            numero_asiento: numero,
            cedula: d.cedula.trim(),
            nombres: d.nombres.trim(),
            apellidos: d.apellidos.trim(),
            tipo: d.tipo,
        };
    });

    const boton = $('btnContinuarPago');
    const textoOriginal = boton.textContent;

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

        window.location.href = `pago.html?compra_id=${encodeURIComponent(data.compra_id)}`;
    } catch (error) {
        console.error('No se pudo crear la compra:', error);
        mostrarAlerta(
            error.message || 'No se pudieron reservar los asientos. Inténtalo de nuevo.',
            'danger'
        );
    } finally {
        boton.textContent = textoOriginal;
        boton.disabled = false;
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
}

iniciar();

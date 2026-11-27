// frontend/js/boletoImpreso.js
// Boleto con código QR (cambio 4), el mismo para la ventanilla, la bandeja
// de comprobantes y el cliente. El QR lleva el código único del boleto
// (boletos.codigo), que es lo que valida el usuario bus.
//
// datosBoleto() no usa el DOM (se prueba con node --test). Para dibujar el
// QR la página debe cargar qrcodejs:
//   <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
// y la hoja de estilos css/boleto.css (también para imprimir).

import { dinero, formatearFecha, formatearHora } from './validaciones.js';

export const ORIGENES_VENTA = {
    APP: 'Compra en la aplicación',
    OFICINA: 'Venta en oficina',
    EN_RUTA: 'Venta en ruta'
};

/**
 * Textos del boleto.
 * @param {object} boleto  codigo, numero_asiento, pasajero (o pasajero_nombres y
 *                         pasajero_apellidos), cedula (o pasajero_cedula), tipo
 *                         (o tipo_pasajero), precio.
 * @param {object} viaje   origen, destino, fecha, hora, bus (número o placa), cooperativa.
 * @param {{tipos?: object[], origen?: string}} [opciones]
 */
export function datosBoleto(boleto = {}, viaje = {}, { tipos = [], origen = '' } = {}) {
    const tipo = boleto.tipo ?? boleto.tipo_pasajero ?? 'normal';
    const pasajero = boleto.pasajero
        ?? `${boleto.pasajero_nombres ?? ''} ${boleto.pasajero_apellidos ?? ''}`.trim();

    return {
        codigo: String(boleto.codigo ?? ''),
        ruta: viaje.origen && viaje.destino ? `${viaje.origen} → ${viaje.destino}` : '—',
        fecha: viaje.fecha ? formatearFecha(viaje.fecha) : '—',
        hora: viaje.hora ? formatearHora(viaje.hora) : '—',
        bus: viaje.bus ? String(viaje.bus) : '—',
        cooperativa: viaje.cooperativa ?? '',
        asiento: String(boleto.numero_asiento ?? '—'),
        pasajero: pasajero || '—',
        cedula: boleto.cedula ?? boleto.pasajero_cedula ?? '—',
        tarifa: tipos.find((t) => t.codigo === tipo)?.nombre ?? NOMBRES_TARIFA[tipo] ?? tipo,
        precio: dinero(boleto.precio ?? 0),
        origen: ORIGENES_VENTA[origen] ?? ''
    };
}

/** Nombres de las tarifas si no se cargó tipos_pasajero. */
export const NOMBRES_TARIFA = { normal: 'Adulto', nino: 'Niño', tercera_edad: 'Tercera edad' };

function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    return nodo;
}

/** Dibuja el QR del código dentro del contenedor (o el código en texto si falta la librería). */
export function dibujarQR(contenedor, codigo, tamano = 160) {
    contenedor.replaceChildren();

    if (typeof globalThis.QRCode !== 'function') {
        contenedor.appendChild(el('div', 'small text-muted', 'No se pudo cargar el generador de QR. Usa el código.'));
        return;
    }

    new globalThis.QRCode(contenedor, {
        text: codigo,
        width: tamano,
        height: tamano,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: globalThis.QRCode.CorrectLevel.H
    });
}

/** Descarga el QR dibujado como imagen PNG. */
export function descargarQR(contenedor, codigo) {
    const canvas = contenedor.querySelector('canvas');
    const imagen = contenedor.querySelector('img');
    const url = canvas ? canvas.toDataURL('image/png') : imagen?.src;
    if (!url) return;

    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `boleto_${codigo}.png`;
    enlace.click();
}

/**
 * Tarjeta del boleto lista para imprimir (una por hoja al imprimir).
 * @param {ReturnType<typeof datosBoleto>} d
 * @param {{descargar?: boolean}} [opciones]
 */
export function crearBoletoImpreso(d, { descargar = false } = {}) {
    const caja = el('article', 'boleto-qr');
    caja.setAttribute('aria-label', `Boleto ${d.codigo}`);

    const cabecera = el('div', 'boleto-qr__cabecera');
    cabecera.append(
        el('div', 'boleto-qr__marca', 'MoviPass'),
        el('div', 'boleto-qr__cooperativa', d.cooperativa)
    );

    const cuerpo = el('div', 'boleto-qr__cuerpo');

    const datos = el('dl', 'boleto-qr__datos');
    [
        ['Ruta', d.ruta],
        ['Fecha', d.fecha],
        ['Hora de salida', d.hora],
        ['Bus', d.bus],
        ['Pasajero', d.pasajero],
        ['Cédula', d.cedula],
        ['Tarifa', d.tarifa],
        ['Precio', d.precio]
    ].forEach(([etiqueta, valor]) => datos.append(el('dt', '', etiqueta), el('dd', '', valor)));

    const lado = el('div', 'boleto-qr__lado');
    const asiento = el('div', 'boleto-qr__asiento');
    asiento.append(el('span', 'boleto-qr__etiqueta', 'Asiento'), el('strong', '', d.asiento));
    const qr = el('div', 'boleto-qr__qr');
    lado.append(asiento, qr, el('div', 'boleto-qr__codigo', d.codigo));

    cuerpo.append(datos, lado);
    caja.append(cabecera, cuerpo);

    if (d.origen) caja.appendChild(el('div', 'boleto-qr__pie', `${d.origen} · Presenta este código al abordar.`));

    if (descargar) {
        const boton = el('button', 'btn btn-outline-primary btn-sm mt-2 no-imprimir', 'Descargar QR');
        boton.type = 'button';
        boton.addEventListener('click', () => descargarQR(qr, d.codigo));
        caja.appendChild(boton);
    }

    // El QR se dibuja cuando la tarjeta ya está en la página.
    queueMicrotask(() => dibujarQR(qr, d.codigo));
    return caja;
}

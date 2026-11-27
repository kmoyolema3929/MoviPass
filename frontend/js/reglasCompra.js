// frontend/js/reglasCompra.js
// Reglas de la compra y la venta (cambio 3, parte 3.2): datos de cada
// pasajero, comprobante de pago y motivo de rechazo. Sin DOM ni Supabase
// (se prueban con node --test). La base repite las reglas
// (_preparar_pasajeros, bucket "comprobantes" y rechazar_pago).

import { LIMITES_CUENTA, limpiarTexto, revisarCedula, revisarNombre } from './reglasCuenta.js';

export const LIMITES_COMPRA = {
    nombre: LIMITES_CUENTA.nombre,
    motivoMinimo: 3,
    motivoMaximo: 300,
    comprobanteBytes: 5 * 1024 * 1024 // 5 MB, igual que el bucket "comprobantes"
};

/** Tipos que acepta el bucket "comprobantes" (tipo MIME -> extensiones). */
export const TIPOS_COMPROBANTE = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'application/pdf': ['pdf']
};

/** Valor del atributo accept del campo de archivo. */
export const ACEPTA_COMPROBANTE = Object.keys(TIPOS_COMPROBANTE).join(',');

/**
 * Datos de un pasajero: cédula ecuatoriana válida, nombres y apellidos.
 * @returns {{cedula?: string, nombres?: string, apellidos?: string}} vacío si está bien.
 */
export function revisarPasajero({ cedula, nombres, apellidos } = {}) {
    const errores = {
        cedula: revisarCedula(cedula),
        nombres: revisarNombre(nombres, 'nombres'),
        apellidos: revisarNombre(apellidos, 'apellidos')
    };

    return Object.fromEntries(Object.entries(errores).filter(([, problema]) => problema));
}

/** Pasajero listo para enviar a la base (textos limpios). */
export function pasajeroParaEnviar(numeroAsiento, d) {
    return {
        numero_asiento: numeroAsiento,
        cedula: limpiarTexto(d.cedula),
        nombres: limpiarTexto(d.nombres),
        apellidos: limpiarTexto(d.apellidos),
        tipo: d.tipo
    };
}

/** "1,5 MB" */
export function textoTamano(bytes) {
    const mb = Number(bytes) / (1024 * 1024);
    return `${mb.toLocaleString('es-EC', { maximumFractionDigits: 1 })} MB`;
}

/**
 * Comprobante de pago: JPG, PNG, WebP o PDF y máximo 5 MB.
 * Algunos navegadores no dan el tipo del archivo: entonces se mira la extensión.
 * @param {{name: string, type: string, size: number}|null|undefined} archivo
 * @returns {string} problema ('' si está bien)
 */
export function revisarComprobante(archivo) {
    if (!archivo) return 'Selecciona el comprobante de pago.';

    const extension = String(archivo.name ?? '').split('.').pop().toLowerCase();
    const tipoValido = archivo.type
        ? Object.hasOwn(TIPOS_COMPROBANTE, archivo.type)
        : Object.values(TIPOS_COMPROBANTE).some(extensiones => extensiones.includes(extension));

    if (!tipoValido) {
        return 'El comprobante debe ser una imagen JPG, PNG o WebP, o un PDF.';
    }
    if (!archivo.size) return 'El archivo está vacío. Elige otro.';
    if (archivo.size > LIMITES_COMPRA.comprobanteBytes) {
        return `El archivo pesa ${textoTamano(archivo.size)}. El máximo es 5 MB.`;
    }

    return '';
}

/** Tipo MIME que se envía al subir (por la extensión si el navegador no lo dio). */
export function tipoDeComprobante(archivo) {
    if (archivo?.type) return archivo.type;

    const extension = String(archivo?.name ?? '').split('.').pop().toLowerCase();
    return Object.entries(TIPOS_COMPROBANTE).find(([, extensiones]) => extensiones.includes(extension))?.[0] ?? '';
}

/** Motivo del rechazo de un pago: de 3 a 300 caracteres. */
export function revisarMotivoRechazo(texto) {
    const motivo = limpiarTexto(texto);

    if (motivo.length < LIMITES_COMPRA.motivoMinimo) {
        return 'Escribe el motivo del rechazo (mínimo 3 caracteres).';
    }
    if (motivo.length > LIMITES_COMPRA.motivoMaximo) {
        return `Máximo ${LIMITES_COMPRA.motivoMaximo} caracteres.`;
    }

    return '';
}

/* ----------------------------------------------------------------------
   Cambio 4: precio por tarifa y resumen del cobro (igual que la base,
   _preparar_pasajeros: round(precio * (100 - descuento) / 100, 2)).
   ---------------------------------------------------------------------- */

/** Máximo de asientos por compra o venta (la base exige de 1 a 10). */
export const MAX_ASIENTOS_COMPRA = 10;

/**
 * Precio de un pasajero con el descuento de su tarifa, en dólares con 2 decimales.
 * Se calcula en centavos para no arrastrar errores de decimales.
 */
export function precioConDescuento(precio, descuento = 0) {
    const centavos = Math.round(Number(precio || 0) * 100);
    const porcentaje = Math.min(100, Math.max(0, Number(descuento || 0)));
    return Math.round(centavos * (100 - porcentaje) / 100) / 100;
}

/**
 * Resumen del cobro: una línea por pasajero, subtotal (tarifa normal),
 * descuento y total.
 * @param {number} precio Precio del viaje.
 * @param {{numero_asiento: number, tipo: string}[]} pasajeros
 * @param {{codigo: string, nombre: string, descuento: number}[]} tipos
 */
export function resumenCobro(precio, pasajeros = [], tipos = []) {
    const base = precioConDescuento(precio, 0);

    const lineas = pasajeros.map((p) => {
        const tipo = tipos.find((t) => t.codigo === p.tipo);
        const descuento = Number(tipo?.descuento ?? 0);
        return {
            numero_asiento: p.numero_asiento,
            tipo: p.tipo,
            tarifa: tipo?.nombre ?? p.tipo,
            descuento,
            precio: precioConDescuento(precio, descuento)
        };
    });

    const centavos = (valor) => Math.round(valor * 100);
    const subtotalC = centavos(base) * lineas.length;
    const totalC = lineas.reduce((suma, l) => suma + centavos(l.precio), 0);

    return {
        lineas,
        subtotal: subtotalC / 100,
        descuento: (subtotalC - totalC) / 100,
        total: totalC / 100
    };
}

/* ----------------------------------------------------------------------
   Cambio 4, parte 4.2: cantidad de asientos y acompañantes del cliente.
   ---------------------------------------------------------------------- */

/**
 * Cantidad de asientos que el cliente quiere comprar.
 * @param {string|number} valor Lo que escribió.
 * @param {number} [libres] Asientos libres del viaje (si se conocen).
 * @returns {string} problema ('' si está bien).
 */
export function revisarCantidadAsientos(valor, libres = MAX_ASIENTOS_COMPRA) {
    const texto = String(valor ?? '').trim();
    if (!texto) return 'Indica cuántos asientos necesitas.';

    const cantidad = Number(texto);
    if (!Number.isInteger(cantidad) || cantidad < 1) {
        return `Elige de 1 a ${MAX_ASIENTOS_COMPRA} asientos.`;
    }
    if (cantidad > MAX_ASIENTOS_COMPRA) return `Máximo ${MAX_ASIENTOS_COMPRA} asientos por compra.`;
    if (libres < 1) return 'Este viaje ya no tiene asientos libres.';
    if (cantidad > libres) return `Solo quedan ${libres} asiento(s) libre(s) en este viaje.`;

    return '';
}

/** Mensaje bajo el mapa: cuántos asientos faltan por elegir. */
export function textoSeleccionAsientos(cantidad, elegidos) {
    const faltan = Number(cantidad) - Number(elegidos);
    if (!cantidad) return 'Primero indica cuántos asientos necesitas.';
    if (faltan > 0) return `Elige ${faltan} asiento${faltan === 1 ? '' : 's'} más en el mapa.`;
    if (faltan < 0) return `Elegiste más asientos de los que indicaste: quita ${-faltan}.`;
    return `Listo: elegiste ${cantidad === 1 ? 'el asiento' : `los ${cantidad} asientos`}.`;
}

/**
 * Si se baja la cantidad, se conservan los primeros asientos elegidos.
 * @returns {{seleccion: number[], quitados: number[]}}
 */
export function ajustarSeleccion(seleccion = [], cantidad = 0) {
    return { seleccion: seleccion.slice(0, cantidad), quitados: seleccion.slice(cantidad) };
}

/**
 * Se autocompletan nombres y apellidos solo si están vacíos o si los puso
 * el autocompletado anterior (no se pisa lo que escribió el cliente).
 */
export function puedeAutocompletar(pasajero = {}) {
    const vacio = (texto) => !String(texto ?? '').trim();
    return Boolean(pasajero.autocompletado) || (vacio(pasajero.nombres) && vacio(pasajero.apellidos));
}

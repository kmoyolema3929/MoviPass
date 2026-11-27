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

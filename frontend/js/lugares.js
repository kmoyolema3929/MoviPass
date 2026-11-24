// frontend/js/lugares.js
// Nombres de lugares (cambio 7). Sin dependencias, para usarlo en pantallas y pruebas.

/**
 * Nombre para mostrar de un cantón. Lo calcula la base (cantones.etiqueta):
 *  - "Pastaza (Puyo)" cuando la ciudad cabecera tiene otro nombre, porque los
 *    pasajeros buscan por ciudad;
 *  - "Olmedo (Loja)" y "Olmedo (Manabí)" cuando dos cantones quedarían iguales.
 * Sin etiqueta (datos antiguos), se arma con el nombre y la ciudad.
 */
export function etiquetaCanton(canton) {
    if (canton?.etiqueta) return String(canton.etiqueta).trim();

    const nombre = String(canton?.nombre ?? '').trim();
    const ciudad = String(canton?.ciudad ?? '').trim();

    return !ciudad || ciudad.toLowerCase() === nombre.toLowerCase() ? nombre : `${nombre} (${ciudad})`;
}

/** Sin mayúsculas, tildes ni espacios sobrantes (igual que texto_comparable en la base). */
export function textoComparable(texto) {
    return String(texto ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ');
}

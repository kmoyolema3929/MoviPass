// frontend/js/rutasCompra.js
// Utilidades de navegación del flujo de compra. Se mantienen aparte para poder
// probarlas sin depender del DOM ni de Supabase.

/**
 * Lee el viaje seleccionado desde la barra de direcciones.
 * @param {string} search Cadena de consulta (por ejemplo: "?viaje_id=abc").
 * @returns {string | null} El id del viaje o null si no se indicó.
 */
export function leerViajeId(search) {
    return new URLSearchParams(search ?? '').get('viaje_id') || null;
}

/**
 * URL del resumen de compra, relativa a pages/seleccion-asientos.html.
 * Conserva el viaje en la dirección para no perder el contexto al continuar.
 * @param {string | null} viajeId
 * @returns {string}
 */
export function urlResumenCompra(viajeId) {
    const base = 'compra/resumen-compra.html';
    if (!viajeId) return base;

    return `${base}?viaje_id=${encodeURIComponent(viajeId)}`;
}

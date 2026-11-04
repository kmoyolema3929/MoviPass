// frontend/js/validaciones.js
// Validaciones y utilidades compartidas por varias pantallas.

/** Cédula ecuatoriana: 10 dígitos y dígito verificador (módulo 10). */
export function cedulaValida(cedula) {
    if (!/^\d{10}$/.test(cedula)) return false;

    const provincia = parseInt(cedula.slice(0, 2), 10);
    if (provincia < 1 || (provincia > 24 && provincia !== 30)) return false;

    if (parseInt(cedula[2], 10) > 5) return false;

    let suma = 0;
    for (let i = 0; i < 9; i++) {
        let n = parseInt(cedula[i], 10) * (i % 2 === 0 ? 2 : 1);
        if (n > 9) n -= 9;
        suma += n;
    }

    return (10 - (suma % 10)) % 10 === parseInt(cedula[9], 10);
}

/** Fecha local en formato YYYY-MM-DD (sin desfase por zona horaria). */
export function fechaLocalISO(fecha = new Date()) {
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Suma días a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD. */
export function sumarDias(fechaISO, dias) {
    const [y, m, d] = fechaISO.split('-').map(Number);
    return fechaLocalISO(new Date(y, m - 1, d + dias));
}

/** 2026-11-05 -> 05/11/2026 */
export function formatearFecha(fechaISO) {
    const [y, m, d] = String(fechaISO).slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
}

/** 19:00:00 -> 19:00 */
export function formatearHora(hora) {
    return String(hora).slice(0, 5);
}

export function dinero(valor) {
    return '$' + Number(valor).toFixed(2);
}

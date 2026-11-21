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

/**
 * Placa ecuatoriana: 3 letras y 4 números, guardada como ABC-1234.
 * Quita espacios y guiones y pasa a mayúsculas, para que "abc1234",
 * "ABC 1234" y "ABC-1234" sean la misma placa.
 * Devuelve { placa, valida }; si no es válida, placa es el texto limpio.
 */
export function normalizarPlaca(texto) {
    const limpio = String(texto ?? '').replace(/[\s-]/g, '').toUpperCase();
    const valida = /^[A-Z]{3}[0-9]{4}$/.test(limpio);

    return {
        placa: valida ? `${limpio.slice(0, 3)}-${limpio.slice(3)}` : limpio,
        valida
    };
}

/**
 * Formato de la placa mientras se escribe: mayúsculas, solo letras y números,
 * guion automático después de los 3 primeros caracteres y máximo 8 (ABC-1234).
 * "abc1234" -> "ABC-1234"; "abc-" -> "ABC-" (respeta el guion escrito a mano).
 */
export function formatearPlacaEscrita(texto) {
    const limpio = String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (limpio.length > 3) return `${limpio.slice(0, 3)}-${limpio.slice(3)}`.slice(0, 8);

    return limpio.length === 3 && String(texto).endsWith('-') ? `${limpio}-` : limpio;
}

/** Placa pegada: se normaliza con normalizarPlaca() y se recorta a 8 caracteres. */
export function formatearPlacaPegada(texto) {
    const { placa, valida } = normalizarPlaca(texto);

    return valida ? placa : formatearPlacaEscrita(placa);
}

/** Aplica el formato de placa a un campo mientras se escribe o se pega. */
export function prepararCampoPlaca(campo) {
    campo.addEventListener('input', function () {
        const formateada = formatearPlacaEscrita(campo.value);
        if (formateada !== campo.value) campo.value = formateada;
    });

    campo.addEventListener('paste', function (evento) {
        const texto = evento.clipboardData?.getData('text') ?? '';

        // Varias filas o columnas (Excel en el lote): lo maneja buses-lote.js
        if (/[\t\n]/.test(texto.trim())) return;

        // Sin esto, el navegador recortaría el texto a 8 caracteres antes de limpiarlo
        evento.preventDefault();
        campo.value = formatearPlacaPegada(texto);
        campo.dispatchEvent(new Event('input', { bubbles: true }));
    });
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

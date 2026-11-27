// frontend/js/formularios.js
// Ayudas de pantalla para los formularios (cambio 3):
//  - Cada campo lleva data-campo="clave" y su mensaje, data-error="clave".
//  - mostrarErrores() pinta el mensaje junto a cada campo y enfoca el primero.
//  - limpiarAlEscribir() quita el error del campo en cuanto se corrige.
//  - conBotonOcupado() deshabilita el botón mientras se guarda (evita el doble envío).

/**
 * @param {HTMLFormElement} form
 * @param {Record<string, string>} errores { clave: mensaje }
 * @returns {boolean} true si no hay errores.
 */
export function mostrarErrores(form, errores = {}) {
    let primero = null;

    form.querySelectorAll('[data-campo]').forEach(campo => {
        const clave = campo.dataset.campo;
        const problema = errores[clave] ?? '';
        const aviso = form.querySelector(`[data-error="${clave}"]`);

        campo.classList.toggle('is-invalid', Boolean(problema));
        campo.setAttribute('aria-invalid', problema ? 'true' : 'false');
        if (aviso) aviso.textContent = problema;
        if (problema && !primero && !campo.disabled && campo.offsetParent !== null) primero = campo;
    });

    primero?.focus();
    return Object.values(errores).every(problema => !problema);
}

/** Muestra un solo error junto a un campo. */
export function mostrarErrorCampo(form, clave, problema) {
    const campo = form.querySelector(`[data-campo="${clave}"]`);
    const aviso = form.querySelector(`[data-error="${clave}"]`);

    campo?.classList.toggle('is-invalid', Boolean(problema));
    if (aviso) aviso.textContent = problema ?? '';
    if (problema) campo?.focus();
}

/** Quita el error de cada campo al escribir o cambiar su valor. */
export function limpiarAlEscribir(form) {
    form.querySelectorAll('[data-campo]').forEach(campo => {
        const limpiar = () => {
            campo.classList.remove('is-invalid');
            campo.removeAttribute('aria-invalid');
        };
        campo.addEventListener('input', limpiar);
        campo.addEventListener('change', limpiar);
    });
}

/** Deja solo dígitos mientras se escribe (cédula, teléfono, código). */
export function soloDigitos(campo) {
    campo.addEventListener('input', () => {
        const limpio = campo.value.replace(/\D/g, '');
        if (limpio !== campo.value) campo.value = limpio;
    });
}

/**
 * Ejecuta una acción con el botón deshabilitado y un texto de espera.
 * Si la acción devuelve true, el botón queda deshabilitado (por ejemplo,
 * porque la página va a redirigir).
 * @param {HTMLButtonElement} boton
 * @param {string} textoOcupado
 * @param {() => Promise<boolean|void>} accion
 */
export async function conBotonOcupado(boton, textoOcupado, accion) {
    if (boton.disabled) return;

    const textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = textoOcupado;
    let mantener = false;

    try {
        mantener = Boolean(await accion());
    } finally {
        if (!mantener) {
            boton.disabled = false;
            boton.textContent = textoOriginal;
        }
    }
}

/** Mostrar u ocultar la contraseña con un botón. */
export function conectarVerPassword(boton, campo) {
    if (!boton || !campo) return;

    boton.addEventListener('click', () => {
        const visible = campo.type === 'text';
        campo.type = visible ? 'password' : 'text';
        boton.textContent = visible ? 'Ver' : 'Ocultar';
        boton.setAttribute('aria-pressed', String(!visible));
    });
}

// frontend/js/combos.js
// Llenado de combos (<select>) con la misma regla en toda la aplicación:
//  - Mientras carga: "Cargando..." y deshabilitado.
//  - Primera opción "Selecciona..." deshabilitada, o "Todos" en los filtros.
//  - Valor por defecto o valor guardado (al editar).
//  - Si solo hay una opción posible, se selecciona sola.
//  - Si falla: mensaje en el combo y un botón "Reintentar" debajo.

const TEXTO_INICIAL = 'Selecciona...';

// Número de carga por combo: una respuesta vieja no pisa a una más reciente.
const cargas = new WeakMap();

function nuevaCarga(select) {
    const turno = (cargas.get(select) ?? 0) + 1;
    cargas.set(select, turno);
    return turno;
}

function crearOpcion(valor, texto, { deshabilitada = false, seleccionada = false } = {}) {
    const opcion = document.createElement('option');
    opcion.value = valor;
    opcion.textContent = texto;
    if (deshabilitada) opcion.disabled = true;
    if (seleccionada) {
        // defaultSelected: form.reset() vuelve a esta opción y no a la primera habilitada.
        opcion.defaultSelected = true;
        opcion.selected = true;
    }
    return opcion;
}

function idReintentar(select) {
    return `${select.id}-reintentar`;
}

function quitarReintentar(select) {
    document.getElementById(idReintentar(select))?.remove();
}

function mostrarReintentar(select, accion, anclaPropia = null) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.id = idReintentar(select);
    boton.className = 'btn btn-link btn-sm p-0 mt-1';
    boton.textContent = 'Reintentar';
    boton.addEventListener('click', accion);

    // Si el combo está dentro de un contenedor con ícono, el botón va debajo de ese contenedor.
    // anclaPropia sirve cuando el combo está en un <fieldset disabled> (el botón quedaría deshabilitado).
    const ancla = anclaPropia ?? select.closest?.('.position-relative, .input-group') ?? select;
    ancla.after(boton);
}

function dejarSoloUna(select, texto) {
    select.replaceChildren(crearOpcion('', texto, { deshabilitada: true, seleccionada: true }));
    select.value = '';
    select.disabled = true;
}

const valorPorDefecto = (item) => (item !== null && typeof item === 'object' ? item.id : item);
const textoPorDefecto = (item) => (item !== null && typeof item === 'object' ? item.nombre : item);

/**
 * Deja un combo vacío y deshabilitado (por ejemplo, el que depende de otro
 * mientras no se elige el primero). Cancela cualquier carga pendiente.
 * @param {HTMLSelectElement} select
 * @param {string} [texto]
 */
export function vaciarCombo(select, texto = TEXTO_INICIAL) {
    nuevaCarga(select);
    quitarReintentar(select);
    dejarSoloUna(select, texto);
}

/**
 * Llena un combo con estado de carga, opción inicial, valor por defecto y error.
 *
 * @param {HTMLSelectElement} select
 * @param {object} config
 * @param {Array|(() => Promise<Array>|Array)} config.cargar  Lista o función que la devuelve.
 * @param {(item) => any}    [config.valor]      Valor de cada opción (por defecto item.id o el item).
 * @param {(item) => string} [config.texto]      Texto de cada opción (por defecto item.nombre o el item).
 * @param {string|null}      [config.inicial]    Opción inicial deshabilitada; null para no ponerla.
 * @param {string|null}      [config.todos]      Opción "Todos" (valor '') para filtros; es el valor por defecto.
 * @param {any}              [config.porDefecto] Valor a seleccionar (por ejemplo, el guardado al editar).
 * @param {boolean}          [config.unica]      Si hay una sola opción, se selecciona sola (true).
 * @param {string}           [config.vacio]      Texto cuando no hay opciones.
 * @param {string}           [config.error]      Texto cuando falla la carga.
 * @param {string}           [config.cargando]   Texto mientras carga.
 * @param {(items) => void}  [config.alReintentar] Se llama cuando un reintento termina bien.
 * @param {Element}          [config.anclaReintentar] Elemento tras el cual va el botón "Reintentar".
 * @returns {Promise<Array|null>} Los elementos cargados, o null si falló o la reemplazó otra carga.
 */
export async function llenarCombo(select, config = {}) {
    const {
        cargar = [],
        error = 'No se pudieron cargar las opciones.',
        cargando = 'Cargando...',
        alReintentar = null,
        anclaReintentar = null,
    } = config;

    const turno = nuevaCarga(select);
    quitarReintentar(select);
    dejarSoloUna(select, cargando);

    let items;
    try {
        items = Array.from((typeof cargar === 'function' ? await cargar() : cargar) ?? []);
    } catch (fallo) {
        if (cargas.get(select) !== turno) return null;

        console.error(`No se pudo cargar el combo #${select.id}:`, fallo);
        dejarSoloUna(select, error);
        mostrarReintentar(select, async () => {
            const cargados = await llenarCombo(select, config);
            if (cargados) alReintentar?.(cargados);
        }, anclaReintentar);
        return null;
    }

    if (cargas.get(select) !== turno) return null;

    ponerOpciones(select, items, config);
    return items;
}

/**
 * Versión síncrona para listas que ya están en memoria: pone la opción
 * inicial (o "Todos"), las opciones y el valor por defecto, y habilita el combo.
 * Acepta la misma configuración que llenarCombo (sin cargar/error/cargando).
 * @returns {string} El valor que quedó seleccionado ('' si ninguno).
 */
export function ponerOpciones(select, items, config = {}) {
    const {
        valor = valorPorDefecto,
        texto = textoPorDefecto,
        inicial = TEXTO_INICIAL,
        todos = null,
        porDefecto = '',
        unica = true,
        vacio = 'No hay opciones disponibles',
    } = config;

    nuevaCarga(select);
    quitarReintentar(select);
    items = Array.from(items ?? []);

    if (items.length === 0 && todos == null) {
        dejarSoloUna(select, vacio);
        return '';
    }

    const valores = items.map((item) => String(valor(item)));
    const guardado = porDefecto == null ? '' : String(porDefecto);

    let elegido = '';
    if (guardado && valores.includes(guardado)) {
        elegido = guardado;
    } else if (unica && todos == null && items.length === 1) {
        elegido = valores[0];
    }

    const primera = todos != null
        ? crearOpcion('', todos, { seleccionada: elegido === '' })
        : inicial != null
            ? crearOpcion('', inicial, { deshabilitada: true, seleccionada: elegido === '' })
            : null;

    const opciones = items.map((item, i) =>
        crearOpcion(valores[i], String(texto(item)), { seleccionada: valores[i] === elegido }));

    select.replaceChildren(...(primera ? [primera] : []), ...opciones);
    if (primera || elegido) select.value = elegido;
    select.disabled = false;

    return select.value ?? elegido;
}

/**
 * Fecha de hoy en Ecuador (America/Guayaquil) como "AAAA-MM-DD".
 * @param {Date} [ahora]
 */
export function fechaHoyEcuador(ahora = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(ahora);
}

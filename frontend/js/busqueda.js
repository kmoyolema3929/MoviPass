import { buscarViajes, obtenerCiudades } from './consultaBusqueda.js';
import { llenarCombo, fechaHoyEcuador } from './combos.js';

const formulario = document.getElementById('form-busqueda');
const origen = document.getElementById('origen');
const destino = document.getElementById('destino');
const fecha = document.getElementById('fecha');
const erroresBusqueda = document.getElementById('errores-busqueda');
const botonBuscar = formulario?.querySelector(
    'button[type="submit"], input[type="submit"]'
);

let consultando = false;

// La fecha de viaje se calcula con la hora de Ecuador (America/Guayaquil).
const obtenerFechaHoy = () => fechaHoyEcuador();

function mostrarErrores(errores) {
    if (!erroresBusqueda) return;

    erroresBusqueda.replaceChildren();
    erroresBusqueda.hidden = errores.length === 0;

    if (errores.length === 0) {
        return;
    }

    const lista = document.createElement('ul');
    lista.className = 'mb-0';

    errores.forEach((mensaje) => {
        const elemento = document.createElement('li');
        elemento.textContent = mensaje;
        lista.appendChild(elemento);
    });

    erroresBusqueda.appendChild(lista);
    erroresBusqueda.focus();
}

/** Mensaje junto al campo (elemento "<id>-error"); '' lo limpia. */
function marcarCampo(id, mensaje) {
    const campo = document.getElementById(id);
    const aviso = document.getElementById(`${id}-error`);

    campo?.classList?.toggle('is-invalid', Boolean(mensaje));
    if (aviso) aviso.textContent = mensaje;
}

/** "2026-11-17" -> "2026-11-18" (sin depender de la zona horaria del equipo). */
function diaSiguiente(fechaISO) {
    const [anio, mes, dia] = fechaISO.split('-').map(Number);
    return new Date(Date.UTC(anio, mes - 1, dia + 1)).toISOString().slice(0, 10);
}

/**
 * Cambio 4: la búsqueda ya no trae viajes que salieron. Si para hoy no
 * queda ninguno, se dice claramente y se ofrece buscar mañana.
 */
function mostrarSinViajesHoy() {
    const estado = document.getElementById('estado-resultados');
    const tarjetas = document.getElementById('tarjetas-viajes');
    if (!estado || !tarjetas) return;

    const manana = diaSiguiente(obtenerFechaHoy());
    const [anio, mes, dia] = manana.split('-');

    estado.textContent = 'Ya no quedan viajes para hoy en esta ruta.';

    const columna = document.createElement('div');
    columna.className = 'col-12';
    const sugerencia = document.createElement('p');
    sugerencia.className = 'mb-2';
    sugerencia.textContent = 'Los viajes de hoy ya salieron. Puedes buscar la misma ruta para mañana.';
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn btn-outline-primary';
    boton.textContent = `Buscar mañana (${dia}/${mes}/${anio})`;
    boton.addEventListener('click', () => {
        fecha.value = manana;
        marcarCampo('fecha', '');
        formulario.requestSubmit();
    });
    columna.append(sugerencia, boton);
    tarjetas.replaceChildren(columna);
}

// Origen y destino comparten una sola consulta; si falla, el reintento vuelve a consultar.
let pedidoCiudades = null;

function ciudadesDisponibles() {
    pedidoCiudades ??= obtenerCiudades().catch((error) => {
        pedidoCiudades = null;
        throw error;
    });

    return pedidoCiudades;
}

function cargarCiudades() {
    if (!origen || !destino) return;

    // No se eligen solas aunque haya una sola ciudad: origen y destino quedarían iguales.
    const comun = {
        cargar: ciudadesDisponibles,
        unica: false,
        vacio: 'No hay ciudades disponibles',
        error: 'No se pudieron cargar las ciudades.',
    };

    llenarCombo(origen, { ...comun, inicial: '¿De dónde sales?' });
    llenarCombo(destino, { ...comun, inicial: '¿A dónde vas?' });
}

if (formulario) {
    if (fecha) {
        const hoy = obtenerFechaHoy();
        fecha.min = hoy;
        if (!fecha.value) fecha.value = hoy;
    }

    cargarCiudades();

    // Al corregir un campo se quita su mensaje.
    [origen, destino, fecha].forEach((campo) => {
        campo?.addEventListener?.('change', () => marcarCampo(campo.id, ''));
    });

    formulario.addEventListener('submit', (evento) => {
        evento.preventDefault();

        if (consultando) {
            return;
        }

        const hoy = obtenerFechaHoy();
        if (fecha) fecha.min = hoy;

        const errores = [];
        const porCampo = { origen: '', destino: '', fecha: '' };
        const agregar = (campo, mensaje) => {
            errores.push(mensaje);
            porCampo[campo] ||= mensaje;
        };

        if (!origen?.value) {
            agregar('origen', 'Selecciona una ciudad de origen.');
        }

        if (!destino?.value) {
            agregar('destino', 'Selecciona una ciudad de destino.');
        }

        if (!fecha?.value) {
            agregar('fecha', 'Selecciona una fecha de viaje válida.');
        } else if (fecha.value < hoy) {
            agregar('fecha', 'La fecha de viaje no puede ser anterior a hoy.');
        }

        if (origen?.value && destino?.value && origen.value === destino.value) {
            agregar('destino', 'El origen y el destino deben ser diferentes.');
        }

        // Mensaje junto a cada campo; el recuadro de arriba los resume.
        Object.entries(porCampo).forEach(([campo, mensaje]) => marcarCampo(campo, mensaje));
        mostrarErrores(errores);

        if (errores.length > 0) {
            return;
        }

        // La base guarda nombres de ciudades, no los IDs del formulario.
        const criterios = {
            origen: origen.options[origen.selectedIndex].text.trim(),
            destino: destino.options[destino.selectedIndex].text.trim(),
            fecha: fecha.value,
        };

        formulario.dispatchEvent(
            new CustomEvent('busqueda:validada', {
                detail: criterios,
            })
        );
    });

    formulario.addEventListener('busqueda:validada', async (evento) => {
        if (consultando) {
            return;
        }

        consultando = true;

        if (botonBuscar) {
            botonBuscar.disabled = true;
        }

        formulario.setAttribute('aria-busy', 'true');
        mostrarErrores([]);

        formulario.dispatchEvent(new CustomEvent('busqueda:cargando'));

        try {
            const viajes = await buscarViajes(evento.detail);

            formulario.dispatchEvent(
                new CustomEvent('busqueda:resultados', {
                    detail: viajes,
                })
            );

            if (viajes.length === 0 && evento.detail.fecha === obtenerFechaHoy()) {
                mostrarSinViajesHoy();
            }
        } catch (error) {
            console.error('Error al consultar viajes en Supabase:', error);
            formulario.dispatchEvent(new CustomEvent('busqueda:error'));

            mostrarErrores([
                'No se pudo completar la búsqueda. Inténtalo nuevamente.',
            ]);

            const seccion = document.getElementById('resultados-busqueda');
            const estado = document.getElementById('estado-resultados');
            if (seccion) seccion.hidden = false;
            if (estado) estado.textContent = 'No se pudo completar la búsqueda.';
        } finally {
            consultando = false;

            if (botonBuscar) {
                botonBuscar.disabled = false;
            }

            formulario.removeAttribute('aria-busy');
        }
    });
}
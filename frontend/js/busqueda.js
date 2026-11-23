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

    formulario.addEventListener('submit', (evento) => {
        evento.preventDefault();

        if (consultando) {
            return;
        }

        const hoy = obtenerFechaHoy();
        if (fecha) fecha.min = hoy;

        const errores = [];

        if (!origen?.value) {
            errores.push('Selecciona una ciudad de origen.');
        }

        if (!destino?.value) {
            errores.push('Selecciona una ciudad de destino.');
        }

        if (!fecha?.value) {
            errores.push('Selecciona una fecha de viaje válida.');
        } else if (fecha.value < hoy) {
            errores.push('La fecha de viaje no puede ser anterior a hoy.');
        }

        if (origen?.value && destino?.value && origen.value === destino.value) {
            errores.push('El origen y el destino deben ser diferentes.');
        }

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
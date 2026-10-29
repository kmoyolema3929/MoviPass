import { supabase } from "./supabaseClient.js";
import { obtenerSesion, obtenerRol } from "./auth.js";

let busesDisponibles = [];
let configuracionActual = null;

const formulario = document.getElementById("formPlantilla");
const controles = document.getElementById("configuracion");
const selectorBus = document.getElementById("bus");
const filas = document.getElementById("filas");
const columnas = document.getElementById("columnas");
const mensaje = document.getElementById("mensaje");
const resumen = document.getElementById("resumenConfiguracion");
const textoResumen = document.getElementById("textoResumen");

function mostrarMensaje(texto, tipo = "info") {
    mensaje.textContent = texto;
    mensaje.className = `alert alert-${tipo}`;
}

function limpiarResumen() {
    configuracionActual = null;
    resumen.classList.add("d-none");
    formulario.classList.remove("was-validated");
}

function llenarSelectorBuses() {
    const opcionInicial = document.createElement("option");

    opcionInicial.value = "";
    opcionInicial.textContent = "Selecciona un bus";

    selectorBus.replaceChildren(opcionInicial);

    busesDisponibles.forEach(function (bus) {
        const opcion = document.createElement("option");
        const nombreCooperativa =
            bus.cooperativas?.nombre ?? "Cooperativa no disponible";

        opcion.value = bus.id;
        opcion.textContent =
            `${bus.placa} — ${nombreCooperativa} (${bus.tipo_bus})`;

        selectorBus.appendChild(opcion);
    });
}

async function cargarBuses() {
    const { data, error } = await supabase
        .from("buses")
        .select("id, placa, tipo_bus, cooperativa_id, cooperativas(nombre)")
        .order("placa");

    if (error) throw error;

    busesDisponibles = data ?? [];

    llenarSelectorBuses();
}

formulario.addEventListener("submit", function (evento) {
    evento.preventDefault();

    if (controles.disabled) return;

    formulario.classList.add("was-validated");

    if (!formulario.reportValidity()) return;

    const busSeleccionado = busesDisponibles.find(function (bus) {
        return bus.id === selectorBus.value;
    });

    if (!busSeleccionado) {
        mostrarMensaje("Selecciona un bus disponible.", "warning");
        return;
    }

    configuracionActual = {
        bus_id: busSeleccionado.id,
        filas: Number(filas.value),
        columnas: Number(columnas.value)
    };

    const total =
        configuracionActual.filas * configuracionActual.columnas;

    textoResumen.textContent =
        `Bus ${busSeleccionado.placa}: ` +
        `${configuracionActual.filas} filas y ` +
        `${configuracionActual.columnas} asientos por fila. ` +
        `Total: ${total} asientos.`;

    resumen.classList.remove("d-none");
    mensaje.classList.add("d-none");
});

selectorBus.addEventListener("change", limpiarResumen);
filas.addEventListener("input", limpiarResumen);
columnas.addEventListener("input", limpiarResumen);

async function iniciar() {
    controles.disabled = true;

    try {
        const sesion = await obtenerSesion();

        if (!sesion) {
            window.location.replace("../login.html");
            return;
        }

        const rol = await obtenerRol();

        if (!["administrador", "cooperativa"].includes(rol)) {
            window.location.replace("../sin-acceso.html");
            return;
        }

        mostrarMensaje("Cargando buses disponibles...");

        await cargarBuses();

        if (busesDisponibles.length === 0) {
            mostrarMensaje(
                rol === "administrador"
                    ? "No hay buses registrados. Registra uno desde la gestión de buses."
                    : "No hay buses disponibles para esta cuenta. Solicita al administrador que revise tu asignación.",
                "warning"
            );

            return;
        }

        controles.disabled = false;
        mensaje.classList.add("d-none");
    } catch (error) {
        console.error("Error al cargar la plantilla de asientos:", error);

        mostrarMensaje(
            "No se pudieron cargar los buses. Revisa tu conexión y vuelve a intentar.",
            "danger"
        );
    }
}

iniciar();
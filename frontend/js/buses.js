import { supabase } from "./supabaseClient.js";
import { obtenerSesion, obtenerRol } from "./auth.js";

let cooperativas = [];
let buses = [];

const tabla = document.getElementById("tablaBuses");
const formulario = document.getElementById("formBus");
const cooperativa = document.getElementById("cooperativa");
const mensaje = document.getElementById("mensaje");
const botonNuevo = document.getElementById("btnNuevoBus");
const botonGuardar = document.getElementById("btnGuardarBus");
const elementoModal = document.getElementById("modalBus");
const modal = new bootstrap.Modal(elementoModal);

function mostrarMensaje(texto, tipo = "info") {
    mensaje.textContent = texto;
    mensaje.className = `alert alert-${tipo}`;
}

function mostrarEstadoTabla(texto) {
    const fila = document.createElement("tr");
    const celda = document.createElement("td");

    celda.colSpan = 6;
    celda.className = "text-center text-muted py-4";
    celda.textContent = texto;

    fila.appendChild(celda);
    tabla.replaceChildren(fila);
}

function llenarCooperativas() {
    const opcionInicial = document.createElement("option");

    opcionInicial.value = "";
    opcionInicial.textContent = "Selecciona una cooperativa";

    cooperativa.replaceChildren(opcionInicial);

    cooperativas.forEach(function (item) {
        const opcion = document.createElement("option");

        opcion.value = item.id;
        opcion.textContent = item.nombre;

        cooperativa.appendChild(opcion);
    });
}

function mostrarBuses() {
    if (buses.length === 0) {
        mostrarEstadoTabla("No hay buses registrados.");
        return;
    }

    tabla.replaceChildren();

    buses.forEach(function (bus) {
        const fila = document.createElement("tr");

        const cooperativaBus = cooperativas.find(function (item) {
            return item.id === bus.cooperativa_id;
        });

        const valores = [
            bus.placa,
            bus.chasis,
            bus.carroceria,
            cooperativaBus
                ? cooperativaBus.nombre
                : "Cooperativa no disponible",
            bus.tipo_bus
        ];

        valores.forEach(function (valor) {
            const celda = document.createElement("td");

            celda.textContent = valor;
            celda.className = "text-break";

            fila.appendChild(celda);
        });

        const acciones = document.createElement("td");
        acciones.textContent = "—";

        fila.appendChild(acciones);
        tabla.appendChild(fila);
    });
}

async function cargarDatos() {
    mostrarMensaje("Cargando cooperativas y buses...");
    mostrarEstadoTabla("Cargando buses...");

    const [respuestaCooperativas, respuestaBuses] = await Promise.all([
        supabase
            .from("cooperativas")
            .select("id, nombre")
            .order("nombre"),

        supabase
            .from("buses")
            .select(
                "id, placa, chasis, carroceria, cooperativa_id, tipo_bus"
            )
            .order("placa")
    ]);

    if (respuestaCooperativas.error) {
        throw respuestaCooperativas.error;
    }

    if (respuestaBuses.error) {
        throw respuestaBuses.error;
    }

    cooperativas = respuestaCooperativas.data ?? [];
    buses = respuestaBuses.data ?? [];

    llenarCooperativas();
    mostrarBuses();

    mensaje.classList.add("d-none");
    botonNuevo.disabled = cooperativas.length === 0;

    if (cooperativas.length === 0) {
        mostrarMensaje(
            "Primero registra una cooperativa para poder asignarle buses.",
            "warning"
        );
    }
}

botonNuevo.addEventListener("click", function () {
    formulario.reset();
    formulario.classList.remove("was-validated");

    document.getElementById("busId").value = "";
    document.getElementById("tituloModalBus").textContent = "Nuevo bus";

    modal.show();
});

elementoModal.addEventListener("shown.bs.modal", function () {
    document.getElementById("placa").focus();
});

// La creación y la edición se implementarán en el siguiente commit.
formulario.addEventListener("submit", function (evento) {
    evento.preventDefault();
});

async function iniciar() {
    botonNuevo.disabled = true;
    botonGuardar.disabled = true;

    mostrarEstadoTabla("Comprobando acceso...");

    try {
        const sesion = await obtenerSesion();

        if (!sesion) {
            window.location.replace("../login.html");
            return;
        }

        const rol = await obtenerRol();

        if (rol !== "administrador") {
            window.location.replace("../sin-acceso.html");
            return;
        }

        await cargarDatos();
    } catch (error) {
        console.error("Error al cargar buses:", error);

        mostrarMensaje(
            "No se pudieron cargar los datos. Revisa tu conexión y vuelve a intentar.",
            "danger"
        );

        mostrarEstadoTabla("No se pudo cargar el listado de buses.");
    }
}

iniciar();
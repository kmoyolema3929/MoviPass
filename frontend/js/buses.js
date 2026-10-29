import { supabase } from "./supabaseClient.js";
import { obtenerSesion, obtenerRol } from "./auth.js";

const columnas = "id, placa, chasis, carroceria, cooperativa_id, tipo_bus";

let cooperativas = [];
let buses = [];
let ocupado = false;
let accesoPermitido = false;

const tabla = document.getElementById("tablaBuses");
const formulario = document.getElementById("formBus");
const busId = document.getElementById("busId");
const placa = document.getElementById("placa");
const chasis = document.getElementById("chasis");
const carroceria = document.getElementById("carroceria");
const cooperativa = document.getElementById("cooperativa");
const tipoBus = document.getElementById("tipoBus");
const mensaje = document.getElementById("mensaje");
const tituloModal = document.getElementById("tituloModalBus");
const botonNuevo = document.getElementById("btnNuevoBus");
const botonGuardar = document.getElementById("btnGuardarBus");
const elementoModal = document.getElementById("modalBus");
const modal = new bootstrap.Modal(elementoModal);

const errorFormulario = document.createElement("div");
errorFormulario.className = "alert alert-danger d-none";
errorFormulario.setAttribute("role", "alert");
formulario.querySelector(".modal-body").prepend(errorFormulario);

function mostrarMensaje(texto, tipo = "info") {
    mensaje.textContent = texto;
    mensaje.className = `alert alert-${tipo}`;
}

function cambiarOcupado(valor) {
    ocupado = valor;

    botonNuevo.disabled =
        valor || !accesoPermitido || cooperativas.length === 0;

    botonGuardar.disabled =
        valor || !accesoPermitido || cooperativas.length === 0;

    botonGuardar.textContent = valor
        ? "Procesando..."
        : busId.value ? "Actualizar bus" : "Guardar bus";

    formulario.querySelectorAll("input, select").forEach(function (campo) {
        campo.disabled = valor;
    });

    tabla.querySelectorAll("button").forEach(function (boton) {
        boton.disabled = valor;
    });
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

function prepararFormulario() {
    formulario.reset();
    errorFormulario.classList.add("d-none");
    formulario.classList.remove("was-validated");

    busId.value = "";
    placa.setCustomValidity("");
    cooperativa.setCustomValidity("");

    tituloModal.textContent = "Nuevo bus";
    botonGuardar.textContent = "Guardar bus";
}

function abrirEdicion(id) {
    if (ocupado || !accesoPermitido) return;

    const bus = buses.find(function (item) {
        return item.id === id;
    });

    if (!bus) return;

    prepararFormulario();

    busId.value = bus.id;
    placa.value = bus.placa;
    chasis.value = bus.chasis;
    carroceria.value = bus.carroceria;
    cooperativa.value = bus.cooperativa_id;
    tipoBus.value = bus.tipo_bus;

    tituloModal.textContent = "Editar bus";
    botonGuardar.textContent = "Actualizar bus";

    modal.show();
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
            cooperativaBus ? cooperativaBus.nombre : "Cooperativa no disponible",
            bus.tipo_bus
        ];

        valores.forEach(function (valor) {
            const celda = document.createElement("td");

            celda.textContent = valor;
            celda.className = "text-break";

            fila.appendChild(celda);
        });

        const acciones = document.createElement("td");
        const botonEditar = document.createElement("button");

        botonEditar.type = "button";
        botonEditar.className = "btn btn-outline-primary btn-sm";
        botonEditar.textContent = "Editar";

        botonEditar.setAttribute(
            "aria-label",
            `Editar bus con placa ${bus.placa}`
        );

        botonEditar.addEventListener("click", function () {
            abrirEdicion(bus.id);
        });

        const botonEliminar = document.createElement("button");

botonEliminar.type = "button";
botonEliminar.className = "btn btn-outline-danger btn-sm ms-2";
botonEliminar.textContent = "Eliminar";

botonEliminar.setAttribute(
    "aria-label",
    `Eliminar bus con placa ${bus.placa}`
);

botonEliminar.addEventListener("click", function () {
    eliminarBus(bus.id);
});

acciones.appendChild(botonEditar);
acciones.appendChild(botonEliminar);
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
            .select(columnas)
            .order("placa")
    ]);

    if (respuestaCooperativas.error) throw respuestaCooperativas.error;
    if (respuestaBuses.error) throw respuestaBuses.error;

    cooperativas = respuestaCooperativas.data ?? [];
    buses = respuestaBuses.data ?? [];

    llenarCooperativas();
    mostrarBuses();

    mensaje.classList.add("d-none");

    if (cooperativas.length === 0) {
        mostrarMensaje(
            "Primero registra una cooperativa para poder asignarle buses.",
            "warning"
        );
    }
}
function obtenerMensajeError(error, accion = "guardar") {
    switch (error?.code) {
        case "23505":
            return "Ya existe un bus con esta placa.";

        case "23503":
            return accion === "eliminar"
                ? "No se puede eliminar el bus porque tiene registros relacionados."
                : "La cooperativa seleccionada ya no está disponible. Recarga la página.";

        case "42501":
            return "No tienes permisos para realizar esta operación.";

        case "PGRST116":
            return "El bus ya no está disponible o tus permisos cambiaron. Recarga la página.";

        case "23502":
        case "23514":
        case "22001":
            return "Revisa los campos obligatorios y la longitud de los datos.";

        default:
            return `No se pudo ${accion} el bus. Revisa tu conexión e inténtalo nuevamente.`;
    }
}

async function eliminarBus(id) {
    if (ocupado || !accesoPermitido) return;

    const bus = buses.find(function (item) {
        return item.id === id;
    });

    if (!bus) return;

    const confirmado = window.confirm(
        `¿Deseas eliminar el bus con placa ${bus.placa}? Esta acción no se puede deshacer.`
    );

    if (!confirmado) return;

    cambiarOcupado(true);

    try {
        const { data, error } = await supabase
            .from("buses")
            .delete()
            .eq("id", id)
            .select("id")
            .single();

        if (error) throw error;

        buses = buses.filter(function (item) {
            return item.id !== data.id;
        });

        mostrarBuses();
        mostrarMensaje("Bus eliminado correctamente.", "success");
    } catch (error) {
        console.error("Error al eliminar el bus:", error);

        mostrarMensaje(
            obtenerMensajeError(error, "eliminar"),
            "danger"
        );
    } finally {
        cambiarOcupado(false);
    }
}

async function guardarBus(evento) {
    evento.preventDefault();

    if (ocupado || !accesoPermitido) return;

    errorFormulario.classList.add("d-none");

    const idActual = busId.value;

    placa.value = placa.value.trim().toUpperCase();
    chasis.value = chasis.value.trim();
    carroceria.value = carroceria.value.trim();

    placa.setCustomValidity("");
    cooperativa.setCustomValidity("");

    const placaDuplicada = buses.some(function (bus) {
        return bus.placa === placa.value && bus.id !== idActual;
    });

    if (placaDuplicada) {
        placa.setCustomValidity("Ya existe un bus con esta placa.");
    }

    const cooperativaValida = cooperativas.some(function (item) {
        return item.id === cooperativa.value;
    });

    if (!cooperativaValida) {
        cooperativa.setCustomValidity("Selecciona una cooperativa registrada.");
    }

    formulario.classList.add("was-validated");

    if (!formulario.checkValidity()) {
        formulario.reportValidity();
        return;
    }

    const datos = {
        placa: placa.value,
        chasis: chasis.value,
        carroceria: carroceria.value,
        cooperativa_id: cooperativa.value,
        tipo_bus: tipoBus.value
    };

    cambiarOcupado(true);

    let guardado = false;

    try {
        const consulta = idActual
            ? supabase.from("buses").update(datos).eq("id", idActual)
            : supabase.from("buses").insert(datos);

        const { data, error } = await consulta.select(columnas).single();

        if (error) throw error;

        buses = buses.filter(function (bus) {
            return bus.id !== data.id;
        });

        buses.push(data);

        buses.sort(function (a, b) {
            return a.placa.localeCompare(b.placa, "es");
        });

        mostrarBuses();

        mostrarMensaje(
            idActual ? "Bus actualizado correctamente." : "Bus registrado correctamente.",
            "success"
        );

        guardado = true;
    } catch (error) {
        console.error("Error al guardar el bus:", error);

      errorFormulario.textContent = obtenerMensajeError(error, "guardar");

        errorFormulario.classList.remove("d-none");
    } finally {
        cambiarOcupado(false);
    }

    if (guardado) modal.hide();
}

botonNuevo.addEventListener("click", function () {
    if (ocupado || !accesoPermitido || cooperativas.length === 0) return;

    prepararFormulario();
    modal.show();
});

placa.addEventListener("input", function () {
    placa.setCustomValidity("");
});

cooperativa.addEventListener("change", function () {
    cooperativa.setCustomValidity("");
});

elementoModal.addEventListener("shown.bs.modal", function () {
    placa.focus();
});

elementoModal.addEventListener("hide.bs.modal", function (evento) {
    if (ocupado) evento.preventDefault();
});

elementoModal.addEventListener("hidden.bs.modal", prepararFormulario);
formulario.addEventListener("submit", guardarBus);

async function iniciar() {
    cambiarOcupado(true);
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

        accesoPermitido = true;

        await cargarDatos();
    } catch (error) {
        accesoPermitido = false;

        console.error("Error al cargar buses:", error);

        mostrarMensaje(
            "No se pudieron cargar los datos. Revisa tu conexión y vuelve a intentar.",
            "danger"
        );

        mostrarEstadoTabla("No se pudo cargar el listado de buses.");
    } finally {
        cambiarOcupado(false);
    }
}

iniciar();
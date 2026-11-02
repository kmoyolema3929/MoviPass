"use strict";

// Datos de demostración para probar la interfaz del issue #28.
// Los catálogos y los buses se conectarán a la base de datos
// en la implementación del CRUD correspondiente.
const cooperativas = [
    { id: "coop-demo-1", nombre: "Cooperativa de ejemplo A" },
    { id: "coop-demo-2", nombre: "Cooperativa de ejemplo B" }
];

const buses = [
    {
        id: 1,
        placa: "AAA-0001",
        chasis: "CHASIS-DEMO-001",
        carroceria: "Carrocería de ejemplo",
        cooperativaId: "coop-demo-1",
        tipoBus: "Interprovincial"
    }
];

let siguienteId = 2;

const tabla = document.getElementById("tablaBuses");
const formulario = document.getElementById("formBus");
const busId = document.getElementById("busId");
const placa = document.getElementById("placa");
const chasis = document.getElementById("chasis");
const carroceria = document.getElementById("carroceria");
const cooperativa = document.getElementById("cooperativa");
const tipoBus = document.getElementById("tipoBus");
const tituloModal = document.getElementById("tituloModalBus");
const botonGuardar = document.getElementById("btnGuardarBus");
const mensaje = document.getElementById("mensaje");
const elementoModal = document.getElementById("modalBus");
const modal = new bootstrap.Modal(elementoModal);

function cargarCooperativas() {
    cooperativas.forEach(function (item) {
        const opcion = document.createElement("option");
        opcion.value = item.id;
        opcion.textContent = item.nombre;
        cooperativa.appendChild(opcion);
    });
}

function mostrarMensaje(texto) {
    mensaje.textContent = texto;
    mensaje.classList.remove("d-none");
}

function prepararFormulario() {
    formulario.reset();
    formulario.classList.remove("was-validated");
    placa.setCustomValidity("");
    busId.value = "";
}

function mostrarBuses() {
    tabla.replaceChildren();

    if (buses.length === 0) {
        const fila = document.createElement("tr");
        const celda = document.createElement("td");

        celda.colSpan = 6;
        celda.className = "text-nowrap";
        celda.textContent = "No hay buses registrados.";

        fila.appendChild(celda);
        tabla.appendChild(fila);
        return;
    }

    buses.forEach(function (bus) {
        const fila = document.createElement("tr");
        const cooperativaBus = cooperativas.find(function (item) {
            return item.id === bus.cooperativaId;
        });

        const valores = [
            bus.placa,
            bus.chasis,
            bus.carroceria,
            cooperativaBus ? cooperativaBus.nombre : "Sin cooperativa",
            bus.tipoBus
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
        botonEditar.setAttribute("aria-label", `Editar bus con placa ${bus.placa}`);

        botonEditar.addEventListener("click", function () {
            abrirEdicion(bus.id);
        });

        acciones.appendChild(botonEditar);
        fila.appendChild(acciones);
        tabla.appendChild(fila);
    });
}

function abrirEdicion(id) {
    const bus = buses.find(function (item) {
        return item.id === id;
    });

    if (!bus) {
        return;
    }

    prepararFormulario();

    busId.value = String(bus.id);
    placa.value = bus.placa;
    chasis.value = bus.chasis;
    carroceria.value = bus.carroceria;
    cooperativa.value = bus.cooperativaId;
    tipoBus.value = bus.tipoBus;

    tituloModal.textContent = "Editar bus";
    botonGuardar.textContent = "Actualizar bus";

    modal.show();
}

document.getElementById("btnNuevoBus").addEventListener("click", function () {
    prepararFormulario();

    tituloModal.textContent = "Nuevo bus";
    botonGuardar.textContent = "Guardar bus";

    modal.show();
});

elementoModal.addEventListener("shown.bs.modal", function () {
    placa.focus();
});

elementoModal.addEventListener("hidden.bs.modal", prepararFormulario);

placa.addEventListener("input", function () {
    placa.setCustomValidity("");
});

formulario.addEventListener("submit", function (evento) {
    evento.preventDefault();

    placa.value = placa.value.trim().toUpperCase();
    chasis.value = chasis.value.trim();
    carroceria.value = carroceria.value.trim();
    placa.setCustomValidity("");

    const idActual = busId.value === "" ? null : Number(busId.value);

    const placaDuplicada = buses.some(function (bus) {
        return bus.placa === placa.value && bus.id !== idActual;
    });

    if (placaDuplicada) {
        placa.setCustomValidity("Ya existe un bus con esta placa.");
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
        cooperativaId: cooperativa.value,
        tipoBus: tipoBus.value
    };

    if (idActual !== null) {
        const indice = buses.findIndex(function (bus) {
            return bus.id === idActual;
        });

        if (indice === -1) {
            return;
        }

        buses[indice] = { id: idActual, ...datos };
        mostrarMensaje("Bus actualizado correctamente.");
    } else {
        buses.push({ id: siguienteId, ...datos });
        siguienteId += 1;

        mostrarMensaje("Bus registrado correctamente.");
    }

    mostrarBuses();
    modal.hide();
});

cargarCooperativas();
mostrarBuses();
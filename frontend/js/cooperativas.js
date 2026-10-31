const cooperativas = [];
let siguienteId = 1;

const tabla = document.getElementById("tablaCooperativas");
const formulario = document.getElementById("formCooperativa");
const tituloModal = document.getElementById("tituloModal");
const mensaje = document.getElementById("mensaje");

const campoId = document.getElementById("cooperativaId");
const nombre = document.getElementById("nombre");
const ruc = document.getElementById("ruc");
const direccion = document.getElementById("direccion");
const telefono = document.getElementById("telefono");

const ventana = document.getElementById("modalCooperativa");
const modal = bootstrap.Modal.getOrCreateInstance(ventana);
const campos = [nombre, ruc, direccion, telefono];

function mostrarCooperativas() {
    tabla.replaceChildren();

    if (cooperativas.length === 0) {
        const fila = document.createElement("tr");
        const celda = document.createElement("td");

        celda.colSpan = 5;
        celda.className = "text-center text-muted py-4";
        celda.textContent = "No hay cooperativas para mostrar.";

        fila.appendChild(celda);
        tabla.appendChild(fila);
        return;
    }

    cooperativas.forEach(function (cooperativa) {
        const fila = document.createElement("tr");

        const datos = [
            cooperativa.nombre,
            cooperativa.ruc,
            cooperativa.direccion,
            cooperativa.telefono
        ];

        datos.forEach(function (dato) {
            const celda = document.createElement("td");
            celda.textContent = dato;
            fila.appendChild(celda);
        });

        const acciones = document.createElement("td");
        const botonEditar = document.createElement("button");

        botonEditar.type = "button";
        botonEditar.className = "btn btn-outline-primary btn-sm";
        botonEditar.textContent = "Editar";
        botonEditar.setAttribute(
            "aria-label",
            "Editar " + cooperativa.nombre
        );

        botonEditar.addEventListener("click", function () {
            editarCooperativa(cooperativa.id);
        });

        acciones.appendChild(botonEditar);
        fila.appendChild(acciones);
        tabla.appendChild(fila);
    });
}

function limpiarFormulario() {
    formulario.reset();
    campoId.value = "";

    campos.forEach(function (campo) {
        campo.setCustomValidity("");
    });
}

document.getElementById("btnNuevaCooperativa")
    .addEventListener("click", function () {
        limpiarFormulario();
        tituloModal.textContent = "Nueva Cooperativa";
    });

function editarCooperativa(id) {
    const cooperativa = cooperativas.find(function (elemento) {
        return elemento.id === id;
    });

    if (!cooperativa) {
        return;
    }

    limpiarFormulario();

    campoId.value = cooperativa.id;
    nombre.value = cooperativa.nombre;
    ruc.value = cooperativa.ruc;
    direccion.value = cooperativa.direccion;
    telefono.value = cooperativa.telefono;

    tituloModal.textContent = "Editar Cooperativa";
    modal.show();
}

campos.forEach(function (campo) {
    campo.addEventListener("input", function () {
        campo.setCustomValidity("");
    });
});

formulario.addEventListener("submit", function (evento) {
    evento.preventDefault();

    campos.forEach(function (campo) {
        campo.value = campo.value.trim();
        campo.setCustomValidity(
            campo.value === "" ? "Completa este campo." : ""
        );
    });

    const id = campoId.value === "" ? null : Number(campoId.value);

    const rucRepetido = cooperativas.some(function (cooperativa) {
        return cooperativa.ruc === ruc.value && cooperativa.id !== id;
    });

    if (rucRepetido) {
        ruc.setCustomValidity("Ya existe una cooperativa con este RUC.");
    }

    if (!formulario.reportValidity()) {
        return;
    }

    const datos = {
        nombre: nombre.value,
        ruc: ruc.value,
        direccion: direccion.value,
        telefono: telefono.value
    };

    if (id === null) {
        cooperativas.push({
            id: siguienteId++,
            ...datos
        });

        mensaje.textContent = "Cooperativa agregada a la tabla.";
    } else {
        const cooperativa = cooperativas.find(function (elemento) {
            return elemento.id === id;
        });

        if (!cooperativa) {
            return;
        }

        Object.assign(cooperativa, datos);
        mensaje.textContent = "Cooperativa actualizada en la tabla.";
    }

    mostrarCooperativas();
    modal.hide();
    mensaje.classList.remove("d-none");
});

ventana.addEventListener("shown.bs.modal", function () {
    nombre.focus();
});

mostrarCooperativas();
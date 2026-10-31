import { supabase } from "./supabaseClient.js";

const tabla = document.getElementById("tablaCooperativas");
const formulario = document.getElementById("formCooperativa");
const formAcceso = document.getElementById("formAcceso");

const seccionAcceso = document.getElementById("seccionAcceso");
const gestion = document.getElementById("gestion");
const mensaje = document.getElementById("mensaje");

const campoId = document.getElementById("cooperativaId");
const nombre = document.getElementById("nombre");
const ruc = document.getElementById("ruc");
const direccion = document.getElementById("direccion");
const telefono = document.getElementById("telefono");

const correo = document.getElementById("correo");
const clave = document.getElementById("clave");

const tituloModal = document.getElementById("tituloModal");
const ventana = document.getElementById("modalCooperativa");
const modal = bootstrap.Modal.getOrCreateInstance(ventana);

const btnGuardar = document.getElementById("btnGuardar");
const btnIngresar = document.getElementById("btnIngresar");
const btnNueva = document.getElementById("btnNuevaCooperativa");
const btnActualizar = document.getElementById("btnActualizar");
const btnCerrarSesion = document.getElementById("btnCerrarSesion");

const campos = [nombre, ruc, direccion, telefono];
const columnas = "id, nombre, ruc, direccion, telefono";

let cooperativas = [];
let ocupado = false;

function mostrarMensaje(texto, tipo = "success") {
    mensaje.className = "alert alert-" + tipo;
    mensaje.textContent = texto;
}

function ocultarMensaje() {
    mensaje.classList.add("d-none");
}

function mostrarError(error) {
    let texto = "No se pudo completar la operación.";

    if (error.code === "23505") {
        texto = "Ya existe una cooperativa con ese RUC.";
    } else if (error.code === "23503") {
        texto = "La cooperativa tiene registros relacionados y no se puede eliminar.";
    } else if (error.code === "42501") {
        texto = "Tu cuenta no tiene permiso para realizar esta operación.";
    } else if (error.code === "PGRST116") {
        texto = "No se encontró el registro o no tienes permiso para modificarlo.";
    } else if (error.message) {
        texto += " " + error.message;
    }

    mostrarMensaje(texto, "danger");
}

function cambiarEstado(valor) {
    ocupado = valor;

    btnGuardar.disabled = valor;
    btnNueva.disabled = valor;
    btnActualizar.disabled = valor;
    btnCerrarSesion.disabled = valor;

    tabla.querySelectorAll("button").forEach(function (boton) {
        boton.disabled = valor;
    });

    btnGuardar.textContent = valor ? "Procesando..." : "Guardar";
}

function mostrarFilaInformativa(texto) {
    tabla.replaceChildren();

    const fila = document.createElement("tr");
    const celda = document.createElement("td");

    celda.colSpan = 5;
    celda.className = "text-center text-muted py-4";
    celda.textContent = texto;

    fila.appendChild(celda);
    tabla.appendChild(fila);
}

function mostrarCooperativas() {
    if (cooperativas.length === 0) {
        mostrarFilaInformativa("No hay cooperativas registradas.");
        return;
    }

    tabla.replaceChildren();

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
        const botones = document.createElement("div");

        botones.className = "d-flex flex-wrap gap-2";

        const editar = document.createElement("button");
        editar.type = "button";
        editar.className = "btn btn-outline-primary btn-sm";
        editar.textContent = "Editar";
        editar.disabled = ocupado;
        editar.setAttribute(
            "aria-label",
            "Editar " + cooperativa.nombre
        );

        editar.addEventListener("click", function () {
            editarCooperativa(cooperativa.id);
        });

        const eliminar = document.createElement("button");
        eliminar.type = "button";
        eliminar.className = "btn btn-outline-danger btn-sm";
        eliminar.textContent = "Eliminar";
        eliminar.disabled = ocupado;
        eliminar.setAttribute(
            "aria-label",
            "Eliminar " + cooperativa.nombre
        );

        eliminar.addEventListener("click", function () {
            eliminarCooperativa(cooperativa.id);
        });

        botones.append(editar, eliminar);
        acciones.appendChild(botones);
        fila.appendChild(acciones);
        tabla.appendChild(fila);
    });
}

async function listarCooperativas() {
    const { data, error } = await supabase
        .from("cooperativas")
        .select(columnas)
        .order("nombre", { ascending: true });

    if (error) {
        throw error;
    }

    cooperativas = data;
    mostrarCooperativas();
}

function limpiarFormulario() {
    formulario.reset();
    campoId.value = "";

    campos.forEach(function (campo) {
        campo.setCustomValidity("");
    });
}

function editarCooperativa(id) {
    if (ocupado) {
        return;
    }

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

async function guardarCooperativa(evento) {
    evento.preventDefault();

    if (ocupado) {
        return;
    }

    campos.forEach(function (campo) {
        campo.value = campo.value.trim();

        campo.setCustomValidity(
            campo.value === "" ? "Completa este campo." : ""
        );
    });

    if (!formulario.reportValidity()) {
        return;
    }

    const id = campoId.value;

    const datos = {
        nombre: nombre.value,
        ruc: ruc.value,
        direccion: direccion.value,
        telefono: telefono.value
    };

    cambiarEstado(true);

    try {
        let consulta;

        if (id === "") {
            consulta = supabase
                .from("cooperativas")
                .insert(datos);
        } else {
            consulta = supabase
                .from("cooperativas")
                .update(datos)
                .eq("id", id);
        }

        const { data, error } = await consulta
            .select(columnas)
            .single();

        if (error) {
            throw error;
        }

        if (id === "") {
            cooperativas.push(data);
        } else {
            cooperativas = cooperativas.map(function (cooperativa) {
                return cooperativa.id === id ? data : cooperativa;
            });
        }

        cooperativas.sort(function (a, b) {
            return a.nombre.localeCompare(b.nombre, "es");
        });

        mostrarCooperativas();
        modal.hide();

        mostrarMensaje(
            id === ""
                ? "Cooperativa creada correctamente."
                : "Cooperativa actualizada correctamente."
        );
    } catch (error) {
        mostrarError(error);
    } finally {
        cambiarEstado(false);
    }
}

async function eliminarCooperativa(id) {
    if (ocupado) {
        return;
    }

    const cooperativa = cooperativas.find(function (elemento) {
        return elemento.id === id;
    });

    if (!cooperativa) {
        return;
    }

    const confirmado = window.confirm(
        '¿Deseas eliminar la cooperativa "' + cooperativa.nombre + '"?'
    );

    if (!confirmado) {
        return;
    }

    cambiarEstado(true);

    try {
        const { error } = await supabase
            .from("cooperativas")
            .delete()
            .eq("id", id)
            .select("id")
            .single();

        if (error) {
            throw error;
        }

        cooperativas = cooperativas.filter(function (elemento) {
            return elemento.id !== id;
        });

        mostrarCooperativas();
        mostrarMensaje("Cooperativa eliminada correctamente.");
    } catch (error) {
        mostrarError(error);
    } finally {
        cambiarEstado(false);
    }
}

async function verificarAcceso() {
    gestion.classList.add("d-none");
    seccionAcceso.classList.add("d-none");
    btnCerrarSesion.classList.add("d-none");

    cooperativas = [];
    tabla.replaceChildren();

    mostrarMensaje("Comprobando acceso...", "info");

    const { data, error } = await supabase.auth.getSession();

    if (error) {
        throw error;
    }

    if (!data.session) {
        seccionAcceso.classList.remove("d-none");

        mostrarMensaje(
            "Inicia sesión con tu cuenta de MoviPass.",
            "info"
        );

        return;
    }

    btnCerrarSesion.classList.remove("d-none");

    const { data: rol, error: errorRol } = await supabase
        .rpc("rol_actual");

    if (errorRol) {
        throw errorRol;
    }

    if (rol !== "administrador") {
        mostrarMensaje(
            "Esta sección requiere una cuenta con rol administrador.",
            "warning"
        );

        return;
    }

    gestion.classList.remove("d-none");
    mostrarFilaInformativa("Cargando cooperativas...");

    await listarCooperativas();
    ocultarMensaje();
}

formAcceso.addEventListener("submit", async function (evento) {
    evento.preventDefault();

    btnIngresar.disabled = true;
    btnIngresar.textContent = "Ingresando...";

    try {
        const { error } = await supabase.auth.signInWithPassword({
            email: correo.value.trim(),
            password: clave.value
        });

        if (error) {
            throw error;
        }

        clave.value = "";
        await verificarAcceso();
    } catch (error) {
        mostrarError(error);
    } finally {
        btnIngresar.disabled = false;
        btnIngresar.textContent = "Ingresar";
    }
});

btnCerrarSesion.addEventListener("click", async function () {
    if (ocupado) {
        return;
    }

    btnCerrarSesion.disabled = true;

    try {
        const { error } = await supabase.auth.signOut();

        if (error) {
            throw error;
        }

        modal.hide();
        limpiarFormulario();
        formAcceso.reset();

        await verificarAcceso();
    } catch (error) {
        mostrarError(error);
    } finally {
        btnCerrarSesion.disabled = false;
    }
});

btnNueva.addEventListener("click", function () {
    limpiarFormulario();
    tituloModal.textContent = "Nueva Cooperativa";
});

btnActualizar.addEventListener("click", async function () {
    if (ocupado) {
        return;
    }

    cambiarEstado(true);

    try {
        await listarCooperativas();
        mostrarMensaje("Tabla actualizada.");
    } catch (error) {
        mostrarError(error);
    } finally {
        cambiarEstado(false);
    }
});

campos.forEach(function (campo) {
    campo.addEventListener("input", function () {
        campo.setCustomValidity("");
    });
});

formulario.addEventListener("submit", guardarCooperativa);

ventana.addEventListener("shown.bs.modal", function () {
    nombre.focus();
});

verificarAcceso().catch(mostrarError);
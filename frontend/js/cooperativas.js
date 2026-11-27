import { supabase } from "./supabaseClient.js";
import { cerrarSesion } from "./auth.js";
import { cooperativaParaGuardar, revisarCooperativa } from "./reglasCooperativa.js";
import { limpiarCorreo, mensajeErrorAuth, revisarCorreo } from "./reglasCuenta.js";
import { mensajeErrorBase } from "./erroresBase.js";
import { limpiarAlEscribir, mostrarErrores as marcarErrores } from "./formularios.js";

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
const estado = document.getElementById("estado");

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


// ¡AQUÍ ESTÁ LA CORRECCIÓN! Se agregó "estado" a las columnas
const columnas = "id, nombre, ruc, direccion, telefono, estado";

let cooperativas = [];
let ocupado = false;

function mostrarMensaje(texto, tipo = "success") {
    mensaje.className = "alert alert-" + tipo;
    mensaje.textContent = texto;
}

function ocultarMensaje() {
    mensaje.classList.add("d-none");
}

/** Mensaje claro para los errores de la base (sin textos técnicos). */
function textoErrorCooperativa(error) {
    if (error?.code === "23505") return "Ya existe una cooperativa con ese RUC.";
    if (error?.code === "23503") return "La cooperativa tiene registros relacionados y no se puede eliminar.";
    if (error?.code === "PGRST116") return "No se encontró el registro o no tienes permiso para modificarlo.";

    return mensajeErrorBase(error);
}

function mostrarError(error) {
    mostrarMensaje(textoErrorCooperativa(error), "danger");
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

    celda.colSpan = 6;
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

        // Celda de Estado
        const tdEstado = document.createElement("td");
        const badge = document.createElement("span");
        badge.className = cooperativa.estado === 'activa' ? 'badge bg-success' : 'badge bg-danger';
        badge.textContent = cooperativa.estado === 'activa' ? 'Activa' : 'Suspendida';
        tdEstado.appendChild(badge);
        fila.appendChild(tdEstado);

        // Celda de Acciones
        const acciones = document.createElement("td");
        const botones = document.createElement("div");
        botones.className = "d-flex flex-wrap gap-2";

        const editar = document.createElement("button");
        editar.type = "button";
        editar.className = "btn btn-outline-primary btn-sm";
        editar.textContent = "Editar";
        editar.disabled = ocupado;
        editar.addEventListener("click", function () {
            editarCooperativa(cooperativa.id);
        });

        // Botón de Suspender / Activar
        const suspender = document.createElement("button");
        suspender.type = "button";
        suspender.className = cooperativa.estado === 'activa' ? "btn btn-outline-warning btn-sm" : "btn btn-outline-success btn-sm";
        suspender.textContent = cooperativa.estado === 'activa' ? "Suspender" : "Activar";
        suspender.disabled = ocupado;
        suspender.addEventListener("click", function () {
            cambiarEstadoCooperativa(cooperativa.id, cooperativa.estado);
        });

        const eliminar = document.createElement("button");
        eliminar.type = "button";
        eliminar.className = "btn btn-outline-danger btn-sm";
        eliminar.textContent = "Eliminar";
        eliminar.disabled = ocupado;
        eliminar.addEventListener("click", function () {
            eliminarCooperativa(cooperativa.id);
        });

        botones.append(editar, suspender, eliminar);
        acciones.appendChild(botones);
        fila.appendChild(acciones);
        tabla.appendChild(fila);
    });
}

// Función para cambiar el estado
async function cambiarEstadoCooperativa(id, estadoActual) {
    if (ocupado) return;
    
    const nuevoEstado = estadoActual === 'activa' ? 'suspendida' : 'activa';
    const accion = nuevoEstado === 'activa' ? 'activar' : 'suspender';
    
    if (!confirm(`¿Estás seguro de ${accion} esta cooperativa?`)) return;

    cambiarEstado(true); // Bloquea botones

    try {
        const { error } = await supabase
            .from("cooperativas")
            .update({ estado: nuevoEstado })
            .eq("id", id);

        if (error) throw error;

        // Actualizamos la lista local
        cooperativas = cooperativas.map(c => c.id === id ? { ...c, estado: nuevoEstado } : c);
        
        mostrarCooperativas();
        mostrarMensaje(`Cooperativa ${nuevoEstado === 'activa' ? 'activada' : 'suspendida'} correctamente.`);
    } catch (error) {
        mostrarError(error);
    } finally {
        cambiarEstado(false);
    }
}

async function listarCooperativas() {
    const { data, error } = await supabase
        .from("cooperativas")
        .select(columnas) // <-- Ahora sí trae el estado
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
    marcarErrores(formulario, {});
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

    const escrito = {
        nombre: nombre.value,
        ruc: ruc.value,
        direccion: direccion.value,
        telefono: telefono.value
    };

    if (!marcarErrores(formulario, revisarCooperativa(escrito))) {
        return;
    }

    const id = campoId.value;
    const datos = cooperativaParaGuardar(escrito);

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
        // RUC repetido: el mensaje va junto al campo (el modal sigue abierto).
        if (error?.code === "23505") {
            marcarErrores(formulario, { ruc: textoErrorCooperativa(error) });
        } else if (["23514", "P0001"].includes(error?.code)) {
            marcarErrores(formulario, campoDelError(error));
        } else {
            mostrarError(error);
        }
    } finally {
        cambiarEstado(false);
    }
}

/** El disparador validar_cooperativa dice en su mensaje qué campo falló. */
function campoDelError(error) {
    const texto = mensajeErrorBase(error);
    const campo = /RUC/i.test(texto) ? "ruc"
        : /dirección/i.test(texto) ? "direccion"
            : /teléfono/i.test(texto) ? "telefono"
                : "nombre";

    return { [campo]: texto };
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

// Si el navegador restaura esta página desde el historial (botón "atrás"),
// se vuelve a comprobar la sesión antes de mostrar cualquier dato.
window.addEventListener("pageshow", function (evento) {
    if (!evento.persisted) return;

    gestion.classList.add("d-none");
    seccionAcceso.classList.add("d-none");
    verificarAcceso().catch(mostrarError);
});

formAcceso.addEventListener("submit", async function (evento) {
    evento.preventDefault();

    if (btnIngresar.disabled) return;

    const errores = {
        correo: revisarCorreo(correo.value),
        clave: clave.value ? "" : "Escribe tu contraseña."
    };
    if (!marcarErrores(formAcceso, errores)) return;

    btnIngresar.disabled = true;
    btnIngresar.textContent = "Ingresando...";

    try {
        const { error } = await supabase.auth.signInWithPassword({
            email: limpiarCorreo(correo.value),
            password: clave.value
        });

        if (error) {
            mostrarMensaje(mensajeErrorAuth(error), "danger");
            return;
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

    // auth.js cierra la sesión (con respaldo local si el servidor falla) y usa
    // replace() para que el botón "atrás" no vuelva a esta página.
    await cerrarSesion();
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

limpiarAlEscribir(formulario);
limpiarAlEscribir(formAcceso);
ruc.addEventListener("input", function () {
    const limpio = ruc.value.replace(/\D/g, "");
    if (limpio !== ruc.value) ruc.value = limpio;
});

formulario.addEventListener("submit", guardarCooperativa);

ventana.addEventListener("shown.bs.modal", function () {
    nombre.focus();
});

verificarAcceso().catch(mostrarError);
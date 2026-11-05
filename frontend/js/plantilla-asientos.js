import { exigirRoles } from "./guardas.js";
import {
    obtenerCooperativasPermitidas,
    obtenerBusesDeCooperativa,
    obtenerPlantillasDeCooperativa,
    guardarPlantillaDeTipo,
    guardarPlantillaIndividual,
    quitarPlantillaIndividual
} from "./asientosService.js";

let cooperativaId = "";
let busesCooperativa = [];
let plantillasCooperativa = [];
let plantillaCargada = null;
let configuracionActual = null;
let segundoPisoPreparado = false;
let solicitudCooperativa = 0;
let guardando = false;
let alcance = "tipo";   // "tipo" o "bus"
let busId = "";

const seleccionados = new Set();

const formulario = document.getElementById("formPlantilla");
const controles = document.getElementById("configuracion");
const selectorCooperativa = document.getElementById("cooperativa");
const campoTipo = document.getElementById("tipoBus");
const listaTipos = document.getElementById("tiposSugeridos");
const infoBuses = document.getElementById("busesDelTipo");

const mensaje = document.getElementById("mensaje");
const resumen = document.getElementById("resumenConfiguracion");
const textoResumen = document.getElementById("textoResumen");
const resumenTipos = document.getElementById("resumenTipos");
const mapaPlantilla = document.getElementById("mapaPlantilla");

const cantidadBoletos = document.getElementById("cantidadBoletos");
const estadoSeleccion = document.getElementById("estadoSeleccion");
const botonLimpiar = document.getElementById("limpiarSeleccion");

const numeroPisos = document.getElementById("numeroPisos");
const totalConfigurado = document.getElementById("totalConfigurado");
const botonesPisos = document.getElementById("botonesPisos");
const botonGuardar = document.getElementById("guardarPlantilla");

const listaGuardadas = document.getElementById("listaGuardadas");

const grupoBus = document.getElementById("grupoBus");
const selectorBus = document.getElementById("busObjetivo");
const botonQuitar = document.getElementById("quitarIndividual");
const radiosAlcance = document.querySelectorAll('input[name="alcance"]');

// Utilidades.

function mostrarMensaje(texto, tipo = "info") {
    mensaje.textContent = texto;
    mensaje.className = `alert alert-${tipo}`;
}

function enteroEnRango(valor, minimo, maximo) {
    return Number.isInteger(valor) &&
        valor >= minimo &&
        valor <= maximo;
}

function claveTipo(texto) {
    return String(texto ?? "").trim().toLowerCase();
}

function campo(nombre, numero) {
    return document.getElementById(nombre + numero);
}

function tieneIndividual(bus) {
    return plantillasCooperativa.some(p => p.bus_id === bus.id);
}

function plantillaDeTipo(tipo) {
    return plantillasCooperativa.find(
        p => !p.bus_id && claveTipo(p.tipo_bus) === claveTipo(tipo)
    ) ?? null;
}

// Buses que usan la plantilla del tipo (sin plantilla propia).
function busesDeTipo(clave) {
    return busesCooperativa.filter(function (bus) {
        return claveTipo(bus.tipo_bus) === clave && !tieneIndividual(bus);
    });
}

function configuracionVigente() {
    return Boolean(configuracionActual) &&
        configuracionActual.cooperativa_id === cooperativaId &&
        configuracionActual.alcance === alcance &&
        configuracionActual.clave === claveTipo(campoTipo.value) &&
        (alcance !== "bus" ||
            (Boolean(busId) && configuracionActual.bus_id === busId));
}

function leerPiso(numero) {
    return {
        numero,
        cantidad: Number(campo("cantidad", numero).value),
        filas: Number(campo("filas", numero).value),
        columnas: Number(campo("columnas", numero).value),
        central: campo("central", numero).checked
    };
}

// Con la última fila de 5 asientos: filas de 4 y una última de 5,
// así que la cantidad es 4 × filas + 1 (5, 9, 13, ... 37, 41).
function mensajeDePiso(piso) {
    if (!piso.central) return "";

    if (
        piso.columnas !== 4 ||
        !Number.isInteger(piso.cantidad) ||
        piso.cantidad < 5 ||
        (piso.cantidad - 1) % 4 !== 0
    ) {
        return "Con la última fila de 5 asientos, la cantidad debe ser " +
            "5, 9, 13... (4 × filas + 1), por ejemplo 37 o 41.";
    }

    return "";
}

function actualizarValidezCampos() {
    const mostrarErrores =
        formulario.classList.contains("was-validated");

    formulario.querySelectorAll("input, select").forEach(function (campoForm) {
        if (!mostrarErrores || campoForm.matches(":disabled")) {
            campoForm.removeAttribute("aria-invalid");
        } else {
            campoForm.setAttribute(
                "aria-invalid",
                String(!campoForm.validity.valid)
            );
        }
    });
}

function validarCapacidadTotal() {
    [1, 2].forEach(function (numero) {
        campo("cantidad", numero).setCustomValidity("");
    });

    const pisos = Number(numeroPisos.value);

    if (enteroEnRango(pisos, 1, 2)) {
        const datos = Array.from(
            { length: pisos },
            (_, indice) => leerPiso(indice + 1)
        );

        let hayError = false;

        datos.forEach(function (piso) {
            const texto = mensajeDePiso(piso);

            if (texto) {
                campo("cantidad", piso.numero).setCustomValidity(texto);
                hayError = true;
            }
        });

        const cantidadesValidas = datos.every(function (piso) {
            return enteroEnRango(piso.cantidad, 1, 60);
        });

        if (!hayError && cantidadesValidas) {
            const total = datos.reduce(
                (suma, piso) => suma + piso.cantidad,
                0
            );

            const minimo = pisos === 2 ? 40 : 1;

            if (!enteroEnRango(total, minimo, 60)) {
                campo("cantidad", pisos).setCustomValidity(
                    "Los pisos suman " + total +
                    " asientos. El total debe estar entre " +
                    minimo + " y 60."
                );
            }
        }
    }

    actualizarValidezCampos();

    return formulario.checkValidity();
}

function actualizarTotal() {
    validarCapacidadTotal();

    const datos = Array.from(
        { length: Number(numeroPisos.value) },
        (_, indice) => leerPiso(indice + 1)
    );

    const cantidadesValidas = datos.every(function (piso) {
        return enteroEnRango(piso.cantidad, 1, 60);
    });

    const total = datos.reduce(
        (suma, piso) => suma + piso.cantidad,
        0
    );

    const minimo = datos.length === 2 ? 40 : 1;

    const problema = datos
        .map(piso => campo("cantidad", piso.numero))
        .filter(c => c.validity.customError)
        .map(c => c.validationMessage)[0] ?? "";

    const correcto =
        cantidadesValidas &&
        !problema &&
        enteroEnRango(total, minimo, 60);

    totalConfigurado.className =
        "alert " + (correcto ? "alert-info" : "alert-warning");

    if (!cantidadesValidas) {
        totalConfigurado.textContent =
            "Completa la cantidad de asientos de cada piso.";
    } else if (problema) {
        totalConfigurado.textContent = problema;
    } else {
        totalConfigurado.textContent =
            "Total del bus: " + total + " asientos. " +
            (
                datos.length === 2
                    ? "Los dos pisos deben sumar entre 40 y 60."
                    : "Máximo 60 asientos."
            );
    }
}

// Estado de los botones y del resumen.

function actualizarBotonGuardar() {
    botonGuardar.disabled =
        guardando ||
        controles.disabled ||
        !configuracionVigente();

    botonQuitar.hidden = !(
        alcance === "bus" &&
        busId &&
        plantillasCooperativa.some(p => p.bus_id === busId)
    );
}

function limpiarResumen() {
    configuracionActual = null;
    seleccionados.clear();

    mapaPlantilla.replaceChildren();
    botonesPisos.replaceChildren();

    resumen.classList.add("d-none");
    formulario.classList.remove("was-validated");

    actualizarBotonGuardar();
}

function actualizarInfoBuses() {
    if (alcance === "bus") {
        const bus = busesCooperativa.find(b => b.id === busId);

        infoBuses.className = "alert alert-secondary";

        infoBuses.textContent = !bus
            ? "Elige el bus que tendrá su propia plantilla."
            : tieneIndividual(bus)
                ? "El bus " + bus.placa + " usa una plantilla propia. " +
                  "Los cambios de la plantilla del tipo «" + bus.tipo_bus +
                  "» no le afectan."
                : "El bus " + bus.placa + " usa hoy la plantilla de su tipo. " +
                  "Al guardar tendrá una plantilla propia.";

        return;
    }

    const tipo = campoTipo.value.trim();

    if (!cooperativaId || !tipo) {
        infoBuses.className = "alert alert-secondary";
        infoBuses.textContent = cooperativaId
            ? "Escribe o elige un tipo de bus para ver cuántos buses usarán la plantilla."
            : "Elige una cooperativa y un tipo de bus.";

        return;
    }

    const buses = busesDeTipo(claveTipo(tipo));

    infoBuses.className = "alert alert-secondary";

    infoBuses.textContent = buses.length
        ? "Esta plantilla se aplicará a " + buses.length +
          (buses.length === 1 ? " bus" : " buses") +
          " de tipo «" + tipo + "»: " +
          buses.map(bus => bus.placa).join(", ") + "."
        : "Todavía no hay buses de tipo «" + tipo + "». " +
          "La plantilla quedará guardada y se asignará a los buses " +
          "que registres con este tipo.";
}

// Lista de plantillas guardadas de la cooperativa.

function renderizarGuardadas() {
    listaGuardadas.replaceChildren();

    if (!cooperativaId) {
        const p = document.createElement("p");

        p.className = "text-muted mb-0";
        p.textContent = "Elige una cooperativa para ver sus plantillas.";

        listaGuardadas.appendChild(p);

        return;
    }

    if (!plantillasCooperativa.length) {
        const p = document.createElement("p");

        p.className = "text-muted mb-0";
        p.textContent = "Todavía no has guardado ninguna plantilla.";

        listaGuardadas.appendChild(p);
    } else {
        const grupo = document.createElement("div");

        grupo.className = "list-group";

        plantillasCooperativa.forEach(function (plantilla) {
            const individual = Boolean(plantilla.bus_id);

            const bus = individual
                ? busesCooperativa.find(b => b.id === plantilla.bus_id)
                : null;

            const buses = individual
                ? 1
                : busesDeTipo(claveTipo(plantilla.tipo_bus)).length;

            const fila = document.createElement("div");
            const texto = document.createElement("div");
            const titulo = document.createElement("strong");
            const detalle = document.createElement("div");
            const editar = document.createElement("button");

            fila.className =
                "list-group-item d-flex flex-wrap " +
                "justify-content-between align-items-center gap-2";

            titulo.textContent = individual
                ? "Bus " + (bus?.placa ?? "") + " · " +
                  plantilla.tipo_bus + " (propia)"
                : plantilla.tipo_bus + " (por tipo)";

            detalle.className = "small text-muted";

            detalle.textContent =
                plantilla.numero_pisos +
                (plantilla.numero_pisos === 1 ? " piso" : " pisos") +
                " · " + plantilla.total_asientos + " asientos · " +
                buses + (buses === 1 ? " bus" : " buses");

            texto.append(titulo, detalle);

            editar.type = "button";
            editar.className = "btn btn-outline-primary btn-sm";
            editar.textContent = "Ver / editar";

            editar.addEventListener("click", function () {
                abrirPlantilla(plantilla);
            });

            fila.append(texto, editar);
            grupo.appendChild(fila);
        });

        listaGuardadas.appendChild(grupo);
    }

    // Tipos con buses que aún no tienen plantilla (ni del tipo ni propia).
    const conPlantilla = new Set(
        plantillasCooperativa
            .filter(p => !p.bus_id)
            .map(p => claveTipo(p.tipo_bus))
    );

    const sinPlantilla = [...new Set(
        busesCooperativa
            .filter(b =>
                !conPlantilla.has(claveTipo(b.tipo_bus)) &&
                !tieneIndividual(b)
            )
            .map(b => String(b.tipo_bus).trim())
    )];

    if (sinPlantilla.length) {
        const aviso = document.createElement("div");

        aviso.className = "alert alert-warning mt-3 mb-0";

        aviso.textContent =
            "Faltan plantillas para los buses de tipo: " +
            sinPlantilla.join(", ") + ".";

        listaGuardadas.appendChild(aviso);
    }
}

function llenarSelectorBuses() {
    const previo = busId;

    const inicial = document.createElement("option");

    inicial.value = "";
    inicial.textContent = "Selecciona un bus";

    selectorBus.replaceChildren(
        inicial,
        ...busesCooperativa.map(function (bus) {
            const opcion = document.createElement("option");

            opcion.value = bus.id;
            opcion.textContent =
                bus.placa + " · " + bus.tipo_bus +
                (tieneIndividual(bus) ? " (plantilla propia)" : "");

            return opcion;
        })
    );

    selectorBus.value = previo;
}

function llenarSugerencias() {
    const vistos = new Map();

    [
        ...busesCooperativa.map(bus => bus.tipo_bus),
        ...plantillasCooperativa.map(plantilla => plantilla.tipo_bus)
    ].forEach(function (tipo) {
        const clave = claveTipo(tipo);

        if (clave && !vistos.has(clave)) {
            vistos.set(clave, String(tipo).trim());
        }
    });

    listaTipos.replaceChildren(
        ...[...vistos.values()].map(function (tipo) {
            const opcion = document.createElement("option");

            opcion.value = tipo;

            return opcion;
        })
    );

    llenarSelectorBuses();
    renderizarGuardadas();
}

// Campos del formulario según una plantilla (o los valores iniciales).

function aplicarCampos(plantilla) {
    numeroPisos.value = plantilla ? String(plantilla.numero_pisos) : "1";

    segundoPisoPreparado = plantilla?.numero_pisos === 2;

    [1, 2].forEach(function (numero) {
        const piso = plantilla?.pisos.find(p => p.numero === numero);

        const cantidad = campo("cantidad", numero);
        const filas = campo("filas", numero);
        const columnas = campo("columnas", numero);
        const central = campo("central", numero);

        cantidad.value = piso
            ? String(piso.asientos.length)
            : cantidad.defaultValue;

        filas.value = piso ? String(piso.filas) : filas.defaultValue;

        columnas.value = piso
            ? String(piso.columnas)
            : columnas.defaultValue;

        central.checked = piso
            ? Boolean(piso.ultima_fila_5)
            : central.defaultChecked;

        columnas.readOnly = central.checked;

        filas.max = String(
            central.checked
                ? 14
                : Math.ceil(60 / Math.max(1, Number(columnas.value) || 4))
        );
    });

    const segundoPiso = document.getElementById("configuracionPiso2");

    segundoPiso.hidden = numeroPisos.value !== "2";
    segundoPiso.disabled = numeroPisos.value !== "2";

    actualizarTotal();
}

function ajustarPiso(numero, origen = "cantidad") {
    const campoCantidad = campo("cantidad", numero);
    const campoFilas = campo("filas", numero);
    const campoColumnas = campo("columnas", numero);
    const central = campo("central", numero).checked;

    if (central) campoColumnas.value = "4";

    campoColumnas.readOnly = central;

    const datos = leerPiso(numero);

    if (enteroEnRango(datos.columnas, 1, 4)) {
        const maximoFilas = central
            ? 14
            : Math.ceil(60 / datos.columnas);

        campoFilas.max = String(maximoFilas);

        if (origen === "filas") {
            if (enteroEnRango(datos.filas, 1, maximoFilas)) {
                campoCantidad.value = String(
                    central
                        ? datos.filas * 4 + 1
                        : Math.min(datos.filas * datos.columnas, 60)
                );
            }
        } else if (enteroEnRango(datos.cantidad, 1, 60)) {
            if (central && origen === "central") {
                // Al activar la opción, sube al siguiente valor válido.
                const filas = Math.min(
                    14,
                    Math.max(1, Math.ceil((datos.cantidad - 1) / 4))
                );

                campoFilas.value = String(filas);
                campoCantidad.value = String(filas * 4 + 1);
            } else {
                campoFilas.value = String(
                    central
                        ? Math.max(1, Math.ceil((datos.cantidad - 1) / 4))
                        : Math.ceil(datos.cantidad / datos.columnas)
                );
            }
        }
    }

    limpiarResumen();
    actualizarTotal();
}

function cambiarNumeroPisos() {
    const usaDosPisos = numeroPisos.value === "2";
    const segundo = document.getElementById("configuracionPiso2");

    segundo.hidden = !usaDosPisos;
    segundo.disabled = !usaDosPisos;

    if (usaDosPisos && !segundoPisoPreparado) {
        campo("cantidad", 1).value = "21";
        campo("central", 1).checked = true;

        campo("cantidad", 2).value = "20";
        campo("columnas", 2).value = "4";
        campo("central", 2).checked = false;

        segundoPisoPreparado = true;
    }

    ajustarPiso(1);

    if (usaDosPisos) {
        ajustarPiso(2);
    }
}

// Cooperativa, tipo de bus y bus.

function llenarSelectorCooperativas(cooperativas) {
    const opcionInicial = document.createElement("option");

    opcionInicial.value = "";
    opcionInicial.textContent = "Selecciona una cooperativa";

    selectorCooperativa.replaceChildren(opcionInicial);

    cooperativas.forEach(function (cooperativa) {
        const opcion = document.createElement("option");

        opcion.value = cooperativa.id;
        opcion.textContent = cooperativa.nombre;

        selectorCooperativa.appendChild(opcion);
    });
}

async function cambiarCooperativa() {
    const solicitud = ++solicitudCooperativa;

    cooperativaId = selectorCooperativa.value;
    busesCooperativa = [];
    plantillasCooperativa = [];
    plantillaCargada = null;

    campoTipo.value = "";
    busId = "";
    llenarSelectorBuses();
    listaTipos.replaceChildren();

    limpiarResumen();
    aplicarCampos(null);
    actualizarInfoBuses();
    renderizarGuardadas();

    if (!cooperativaId) {
        mostrarMensaje("Selecciona una cooperativa para empezar.");
        return;
    }

    controles.disabled = true;
    formulario.setAttribute("aria-busy", "true");

    mostrarMensaje("Cargando los buses y plantillas de la cooperativa...");

    try {
        const [buses, plantillas] = await Promise.all([
            obtenerBusesDeCooperativa(cooperativaId),
            obtenerPlantillasDeCooperativa(cooperativaId)
        ]);

        // Evita aplicar una respuesta de otra cooperativa.
        if (solicitud !== solicitudCooperativa) return;

        busesCooperativa = buses;
        plantillasCooperativa = plantillas;

        llenarSugerencias();

        mostrarMensaje(
            buses.length
                ? (
                    alcance === "bus"
                        ? "Elige el bus que tendrá su propia plantilla."
                        : "Escribe o elige el tipo de bus que quieres configurar."
                )
                : "Esta cooperativa todavía no tiene buses. " +
                  "Puedes crear la plantilla de un tipo y se asignará " +
                  "a los buses que registres con ese tipo.",
            buses.length ? "info" : "warning"
        );
    } catch (error) {
        if (solicitud !== solicitudCooperativa) return;

        console.error("No se pudieron cargar los datos:", error);

        mostrarMensaje(
            "No se pudieron cargar los datos de la cooperativa. " +
            "Vuelve a elegirla para reintentar.",
            "danger"
        );
    } finally {
        if (solicitud === solicitudCooperativa) {
            controles.disabled = false;
            formulario.removeAttribute("aria-busy");
            actualizarBotonGuardar();
        }
    }
}

function cambiarTipo() {
    limpiarResumen();

    const tipo = campoTipo.value.trim();

    plantillaCargada = tipo ? plantillaDeTipo(tipo) : null;

    aplicarCampos(plantillaCargada);
    actualizarInfoBuses();

    if (!tipo) {
        mostrarMensaje("Escribe o elige el tipo de bus.");
        return;
    }

    if (!plantillaCargada) {
        mostrarMensaje(
            "El tipo «" + tipo + "» todavía no tiene plantilla. " +
            "Configura sus asientos y genera la vista previa."
        );

        return;
    }

    configuracionActual = structuredClone({
        cooperativa_id: cooperativaId,
        alcance: "tipo",
        bus_id: null,
        tipo_bus: plantillaCargada.tipo_bus,
        clave: claveTipo(plantillaCargada.tipo_bus),
        numero_pisos: plantillaCargada.numero_pisos,
        total_asientos: plantillaCargada.total_asientos,
        pisos: plantillaCargada.pisos
    });

    mostrarConfiguracion();

    mostrarMensaje(
        "Plantilla guardada cargada para el tipo «" +
        plantillaCargada.tipo_bus + "»."
    );
}

function cambiarAlcance() {
    alcance = document.querySelector('input[name="alcance"]:checked').value;
    busId = "";

    grupoBus.hidden = alcance !== "bus";
    selectorBus.required = alcance === "bus";
    selectorBus.value = "";

    campoTipo.readOnly = alcance === "bus";
    campoTipo.value = "";

    plantillaCargada = null;

    limpiarResumen();
    aplicarCampos(null);
    actualizarInfoBuses();

    mostrarMensaje(
        alcance === "bus"
            ? "Elige el bus que tendrá su propia plantilla."
            : "Escribe o elige el tipo de bus que quieres configurar."
    );
}

function cambiarBus() {
    busId = selectorBus.value;

    limpiarResumen();

    const bus = busesCooperativa.find(b => b.id === busId);

    if (!bus) {
        busId = "";
        campoTipo.value = "";
        plantillaCargada = null;

        aplicarCampos(null);
        actualizarInfoBuses();
        mostrarMensaje("Elige el bus que tendrá su propia plantilla.");

        return;
    }

    campoTipo.value = bus.tipo_bus;

    const propia = plantillasCooperativa.find(p => p.bus_id === bus.id) ?? null;

    // Sin plantilla propia, el formulario parte de la del tipo como base,
    // pero no hay versión que comparar al guardar.
    plantillaCargada = propia;

    aplicarCampos(propia ?? plantillaDeTipo(bus.tipo_bus));
    actualizarInfoBuses();

    if (!propia) {
        mostrarMensaje(
            "El bus " + bus.placa + " usa la plantilla de su tipo. " +
            "Ajusta los asientos y genera la vista previa para crearle " +
            "una plantilla propia."
        );

        return;
    }

    configuracionActual = structuredClone({
        cooperativa_id: cooperativaId,
        alcance: "bus",
        bus_id: bus.id,
        tipo_bus: propia.tipo_bus,
        clave: claveTipo(propia.tipo_bus),
        numero_pisos: propia.numero_pisos,
        total_asientos: propia.total_asientos,
        pisos: propia.pisos
    });

    mostrarConfiguracion();

    mostrarMensaje(
        "Plantilla propia cargada para el bus " + bus.placa + "."
    );
}

function abrirPlantilla(plantilla) {
    const alBus = Boolean(plantilla.bus_id);

    document.getElementById(
        alBus ? "alcanceBus" : "alcanceTipo"
    ).checked = true;

    cambiarAlcance();

    if (alBus) {
        selectorBus.value = plantilla.bus_id;
        cambiarBus();
    } else {
        campoTipo.value = plantilla.tipo_bus;
        cambiarTipo();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function quitarPropia() {
    if (guardando || controles.disabled || alcance !== "bus" || !busId) {
        return;
    }

    const bus = busesCooperativa.find(b => b.id === busId);

    if (!bus) return;

    const confirmado = window.confirm(
        "¿Quitar la plantilla propia del bus " + bus.placa + "? " +
        "Volverá a usar la plantilla de su tipo «" + bus.tipo_bus + "»."
    );

    if (!confirmado) return;

    guardando = true;
    controles.disabled = true;

    formulario.setAttribute("aria-busy", "true");
    actualizarBotonGuardar();
    mostrarMensaje("Quitando la plantilla propia...");

    try {
        await quitarPlantillaIndividual(cooperativaId, busId);

        const [buses, plantillas] = await Promise.all([
            obtenerBusesDeCooperativa(cooperativaId),
            obtenerPlantillasDeCooperativa(cooperativaId)
        ]);

        busesCooperativa = buses;
        plantillasCooperativa = plantillas;

        llenarSugerencias();
        cambiarBus();

        mostrarMensaje(
            "El bus " + bus.placa + " vuelve a usar la plantilla de su tipo.",
            "success"
        );
    } catch (error) {
        console.error("Error al quitar la plantilla propia:", error);

        if (error?.code === "55006" || error?.code === "22023") {
            mostrarMensaje(error.message, "warning");
        } else if (error?.code === "42501") {
            mostrarMensaje(
                "Tu cuenta no tiene permiso para cambiar plantillas " +
                "de esta cooperativa.",
                "danger"
            );
        } else {
            mostrarMensaje(
                "No se pudo quitar la plantilla propia. Revisa tu " +
                "conexión e inténtalo de nuevo.",
                "danger"
            );
        }
    } finally {
        guardando = false;
        controles.disabled = false;

        formulario.removeAttribute("aria-busy");
        actualizarBotonGuardar();
    }
}

function actualizarTextoResumen() {
    const esBus = configuracionActual.alcance === "bus";

    const buses = esBus
        ? 1
        : busesDeTipo(configuracionActual.clave).length;

    const placa = esBus
        ? busesCooperativa.find(b => b.id === configuracionActual.bus_id)?.placa ?? ""
        : "";

    textoResumen.textContent =
        (esBus
            ? "Bus " + placa + " (tipo «" + configuracionActual.tipo_bus + "»): "
            : "Tipo «" + configuracionActual.tipo_bus + "»: ") +
        configuracionActual.numero_pisos +
        (configuracionActual.numero_pisos === 1 ? " piso, " : " pisos, ") +
        configuracionActual.total_asientos + " asientos en total. " +
        (
            esBus
                ? "Plantilla propia de este bus."
                : buses
                    ? "Se aplicará a " + buses +
                      (buses === 1 ? " bus." : " buses.")
                    : "Todavía no hay buses de este tipo."
        );
}

function mostrarConfiguracion() {
    cantidadBoletos.max = String(configuracionActual.total_asientos);
    cantidadBoletos.value = "1";

    actualizarTextoResumen();
    dibujarVistaPrevia();
    actualizarContador();

    resumen.classList.remove("d-none");
}

// Generación de los asientos.

function crearPisos(datos) {
    if (
        !Array.isArray(datos) ||
        !enteroEnRango(datos.length, 1, 2)
    ) {
        throw new RangeError("Selecciona uno o dos pisos.");
    }

    datos.forEach(function (piso) {
        const errorCentral = mensajeDePiso(piso);

        if (errorCentral) throw new RangeError(errorCentral);

        const filasEsperadas = piso.central
            ? (piso.cantidad - 1) / 4
            : Math.ceil(piso.cantidad / piso.columnas);

        if (
            !enteroEnRango(piso.cantidad, 1, 60) ||
            !enteroEnRango(piso.columnas, 1, 4) ||
            !Number.isInteger(piso.filas) ||
            piso.filas !== filasEsperadas
        ) {
            throw new RangeError(
                "Revisa los asientos, filas y columnas de cada piso."
            );
        }
    });

    const total = datos.reduce(
        (suma, piso) => suma + piso.cantidad,
        0
    );

    const minimo = datos.length === 2 ? 40 : 1;

    if (!enteroEnRango(total, minimo, 60)) {
        throw new RangeError(
            datos.length === 2
                ? "Los dos pisos deben sumar entre 40 y 60 asientos."
                : "El bus debe tener entre 1 y 60 asientos."
        );
    }

    let numeroSiguiente = 1;

    return datos.map(function (piso, indicePiso) {
        const numeroPiso = indicePiso + 1;

        const asientos = Array.from(
            { length: piso.cantidad },
            function (_, indice) {
                // La última fila de 5 asientos ocupa también el hueco
                // del pasillo: columnas 1 a 5.
                const enFilaDeCinco =
                    piso.central && indice >= (piso.filas - 1) * 4;

                return {
                    numero: numeroSiguiente++,
                    piso: numeroPiso,
                    fila: enFilaDeCinco
                        ? piso.filas
                        : Math.floor(indice / piso.columnas) + 1,
                    columna: enFilaDeCinco
                        ? indice - (piso.filas - 1) * 4 + 1
                        : indice % piso.columnas + 1,
                    tipo: datos.length === 2 && numeroPiso === 1
                        ? "vip"
                        : "normal"
                };
            }
        );

        return {
            numero: numeroPiso,
            filas: piso.filas,
            columnas: piso.columnas,
            ultima_fila_5: piso.central,
            asientos
        };
    });
}

// Prueba de selección de puestos.

function alternarSeleccion(numero, limite, elegidos) {
    if (elegidos.has(numero)) {
        elegidos.delete(numero);
        return true;
    }

    if (elegidos.size >= limite) {
        return false;
    }

    elegidos.add(numero);

    return true;
}

function actualizarContador(aviso = "") {
    if (!configuracionActual) return;

    let totalVip = 0;

    configuracionActual.pisos.forEach(function (piso) {
        const vip = piso.asientos.filter(
            asiento => asiento.tipo === "vip"
        ).length;

        const normales = piso.asientos.length - vip;

        const elegidos = piso.asientos.filter(
            asiento => seleccionados.has(asiento.numero)
        ).length;

        const contadorPiso = document.getElementById(
            "seleccionPiso" + piso.numero
        );

        totalVip += vip;

        if (contadorPiso) {
            contadorPiso.textContent =
                "Normales: " + normales +
                " · VIP: " + vip +
                " · Seleccionados: " + elegidos;
        }
    });

    const total = configuracionActual.pisos.reduce(
        (suma, piso) => suma + piso.asientos.length,
        0
    );

    resumenTipos.textContent =
        "Total: " + total +
        " · Normales: " + (total - totalVip) +
        " · VIP: " + totalVip;

    cantidadBoletos.setAttribute(
        "aria-invalid",
        String(!cantidadBoletos.validity.valid)
    );

    if (!cantidadBoletos.checkValidity()) {
        estadoSeleccion.textContent =
            "Ingresa una cantidad entera entre 1 y " +
            cantidadBoletos.max + ".";

        return;
    }

    const numeros = [...seleccionados].sort((a, b) => a - b);

    estadoSeleccion.textContent =
        "Seleccionados: " + numeros.length +
        " de " + cantidadBoletos.value + ". " +
        (
            numeros.length
                ? "Asientos: " + numeros.join(", ") + ". "
                : ""
        ) +
        aviso;
}

function buscarAsiento(boton) {
    const piso = configuracionActual?.pisos.find(
        p => p.numero === Number(boton.dataset.piso)
    );

    return {
        piso,
        asiento: piso?.asientos.find(
            a => a.numero === Number(boton.dataset.numero)
        )
    };
}

function actualizarBoton(boton) {
    const { asiento } = buscarAsiento(boton);

    if (!asiento) return;

    const elegido = seleccionados.has(asiento.numero);
    const tipo = asiento.tipo === "vip" ? "VIP" : "Normal";

    boton.dataset.tipo = asiento.tipo;
    boton.querySelector("small").textContent = tipo;

    boton.setAttribute("aria-pressed", String(elegido));

    boton.setAttribute(
        "aria-label",
        "Asiento " + asiento.numero +
        ", piso " + asiento.piso +
        ", " + tipo + ", " +
        (elegido ? "seleccionado" : "sin seleccionar")
    );
}

function limpiarSeleccion() {
    seleccionados.clear();

    mapaPlantilla
        .querySelectorAll("button")
        .forEach(actualizarBoton);

    actualizarContador();
}

function seleccionarAsiento(boton) {
    if (!cantidadBoletos.reportValidity()) return;

    const numero = Number(boton.dataset.numero);
    const limite = Number(cantidadBoletos.value);

    if (!alternarSeleccion(numero, limite, seleccionados)) {
        actualizarContador(
            "Desmarca un asiento para poder elegir otro."
        );

        return;
    }

    actualizarBoton(boton);
    actualizarContador();
}

// Vista previa por pisos.

function mostrarPiso(vista) {
    mapaPlantilla.dataset.vista = vista;

    mapaPlantilla
        .querySelectorAll(".plantilla-piso")
        .forEach(function (panel) {
            panel.hidden =
                vista !== "ambos" &&
                panel.dataset.piso !== vista;
        });

    botonesPisos
        .querySelectorAll("button")
        .forEach(function (boton) {
            boton.setAttribute(
                "aria-pressed",
                String(boton.dataset.vista === vista)
            );
        });
}

// Posición visual (0, 1, 2...) de un asiento dentro de su fila.
// Si el piso tiene fila de 5, la cuadrícula tiene 5 ranuras y la del
// medio es el pasillo; solo la última fila usa esa ranura con un asiento.
function ranuraDe(piso, asiento) {
    if (piso.ultima_fila_5) {
        if (asiento.fila === piso.filas) return asiento.columna - 1;

        return asiento.columna <= 2
            ? asiento.columna - 1
            : asiento.columna;
    }

    const centro = Math.ceil(piso.columnas / 2);

    return asiento.columna - 1 +
        (piso.columnas > 1 && asiento.columna > centro ? 1 : 0);
}

function crearBotonAsiento(asiento, piso) {
    const boton = document.createElement("button");
    const etiqueta = document.createElement("small");
    const numero = document.createElement("strong");

    boton.type = "button";
    boton.className = "plantilla-asiento";

    boton.dataset.numero = String(asiento.numero);
    boton.dataset.piso = String(piso.numero);

    etiqueta.textContent = "Asiento";
    numero.textContent = String(asiento.numero);

    boton.append(etiqueta, numero);
    actualizarBoton(boton);

    boton.addEventListener("click", function () {
        seleccionarAsiento(boton);
    });

    return boton;
}

function crearMapaPiso(piso) {
    const panel = document.createElement("section");
    const titulo = document.createElement("h3");
    const detalle = document.createElement("p");
    const contador = document.createElement("p");

    const dibujo = document.createElement("div");
    const frente = document.createElement("div");
    const etiquetaFrente = document.createElement("span");
    const referencia = document.createElement("span");

    panel.id = "vistaPiso" + piso.numero;
    panel.className = "plantilla-piso";
    panel.dataset.piso = String(piso.numero);

    panel.setAttribute(
        "aria-labelledby",
        "tituloPiso" + piso.numero
    );

    titulo.id = "tituloPiso" + piso.numero;
    titulo.className = "h5";
    titulo.textContent = "Piso " + piso.numero;

    detalle.className = "text-muted small mb-1";

    detalle.textContent =
        piso.asientos.length + " asientos: del " +
        piso.asientos[0].numero + " al " +
        piso.asientos[piso.asientos.length - 1].numero + "." +
        (piso.ultima_fila_5 ? " Última fila de 5 asientos." : "");

    contador.id = "seleccionPiso" + piso.numero;
    contador.className = "small mb-3";

    dibujo.className = "plantilla-bus";
    dibujo.setAttribute("role", "group");

    dibujo.setAttribute(
        "aria-label",
        "Mapa de asientos del piso " + piso.numero
    );

    frente.className = "plantilla-frente";
    etiquetaFrente.textContent = "Parte delantera";

    referencia.className = "badge text-bg-secondary";
    referencia.textContent =
        piso.numero === 1 ? "Conductor" : "Piso 2";

    frente.append(etiquetaFrente, referencia);
    dibujo.appendChild(frente);

    const hayPasillo = piso.columnas > 1;

    const ranuras = piso.ultima_fila_5
        ? 5
        : piso.columnas + (hayPasillo ? 1 : 0);

    const indicePasillo = piso.ultima_fila_5
        ? 2
        : hayPasillo
            ? Math.ceil(piso.columnas / 2)
            : -1;

    const anchos = Array.from({ length: ranuras }, function (_, indice) {
        return indice === indicePasillo && !piso.ultima_fila_5
            ? "1rem"
            : "minmax(0, 1fr)";
    }).join(" ");

    for (let fila = 1; fila <= piso.filas; fila++) {
        const filaVisual = document.createElement("div");
        const celdas = Array(ranuras).fill(null);

        piso.asientos
            .filter(asiento => asiento.fila === fila)
            .forEach(function (asiento) {
                celdas[ranuraDe(piso, asiento)] = asiento;
            });

        filaVisual.className = "plantilla-fila";
        filaVisual.style.gridTemplateColumns = anchos;

        filaVisual.setAttribute("role", "group");

        filaVisual.setAttribute(
            "aria-label",
            "Piso " + piso.numero + ", fila " + fila
        );

        celdas.forEach(function (asiento, indice) {
            if (asiento) {
                filaVisual.appendChild(crearBotonAsiento(asiento, piso));
                return;
            }

            const hueco = document.createElement("span");

            hueco.setAttribute("aria-hidden", "true");

            if (indice === indicePasillo) {
                hueco.className = "plantilla-pasillo";
            }

            filaVisual.appendChild(hueco);
        });

        dibujo.appendChild(filaVisual);
    }

    panel.append(titulo, detalle, contador, dibujo);

    return panel;
}

function dibujarVistaPrevia() {
    const fragmento = document.createDocumentFragment();
    const opciones = document.createDocumentFragment();

    configuracionActual.pisos.forEach(function (piso) {
        fragmento.appendChild(crearMapaPiso(piso));

        const boton = document.createElement("button");

        boton.type = "button";
        boton.className = "btn btn-outline-primary";
        boton.dataset.vista = String(piso.numero);

        boton.textContent =
            "Piso " + piso.numero +
            " (" + piso.asientos.length + ")";

        boton.setAttribute(
            "aria-controls",
            "vistaPiso" + piso.numero
        );

        boton.addEventListener("click", function () {
            mostrarPiso(String(piso.numero));
        });

        opciones.appendChild(boton);
    });

    if (configuracionActual.pisos.length === 2) {
        const botonAmbos = document.createElement("button");

        botonAmbos.type = "button";
        botonAmbos.className = "btn btn-outline-primary";
        botonAmbos.dataset.vista = "ambos";
        botonAmbos.textContent = "Ver ambos pisos";

        botonAmbos.setAttribute(
            "aria-controls",
            "vistaPiso1 vistaPiso2"
        );

        botonAmbos.addEventListener("click", function () {
            mostrarPiso("ambos");
        });

        opciones.appendChild(botonAmbos);
    }

    mapaPlantilla.replaceChildren(fragmento);
    botonesPisos.replaceChildren(opciones);

    const verAmbos =
        configuracionActual.pisos.length === 2 &&
        window.matchMedia("(min-width: 768px)").matches;

    mostrarPiso(verAmbos ? "ambos" : "1");
    actualizarBotonGuardar();
}

function navegarAsientos(evento) {
    if (evento.altKey || evento.ctrlKey || evento.metaKey) return;

    const direcciones = {
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0]
    };

    const direccion = direcciones[evento.key];

    const boton = evento.target.closest("button[data-numero]");

    if (!direccion || !boton || !configuracionActual) return;

    const { piso, asiento: actual } = buscarAsiento(boton);

    if (!actual) return;

    evento.preventDefault();

    const [dFila, dRanura] = direccion;
    const ranuraActual = ranuraDe(piso, actual);

    const candidatos = piso.asientos.filter(function (asiento) {
        if (dFila) return asiento.fila === actual.fila + dFila;

        return asiento.fila === actual.fila &&
            (ranuraDe(piso, asiento) - ranuraActual) * dRanura > 0;
    });

    // El más cercano en horizontal (o el siguiente en la fila).
    candidatos.sort(function (a, b) {
        return Math.abs(ranuraDe(piso, a) - ranuraActual) -
            Math.abs(ranuraDe(piso, b) - ranuraActual);
    });

    const destino = candidatos[0];

    if (!destino) return;

    mapaPlantilla.querySelector(
        'button[data-piso="' + piso.numero +
        '"][data-numero="' + destino.numero + '"]'
    )?.focus();
}

// Guardado en Supabase.

async function guardarPlantillaActual() {
    if (guardando || controles.disabled) return;

    if (!configuracionVigente()) {
        mostrarMensaje(
            "Genera la vista previa antes de guardar.",
            "warning"
        );

        return;
    }

    validarCapacidadTotal();

    if (!formulario.reportValidity()) return;

    const configuracion = structuredClone(configuracionActual);
    const versionEsperada = plantillaCargada?.actualizado_en ?? null;

    guardando = true;
    controles.disabled = true;

    formulario.setAttribute("aria-busy", "true");
    botonGuardar.textContent = "Guardando...";

    actualizarBotonGuardar();
    mostrarMensaje("Guardando la plantilla...");

    try {
        const guardada = configuracion.alcance === "bus"
            ? await guardarPlantillaIndividual(
                cooperativaId,
                configuracion.bus_id,
                configuracion,
                versionEsperada
            )
            : await guardarPlantillaDeTipo(
                cooperativaId,
                configuracion,
                versionEsperada
            );

        if (!guardada?.actualizado_en || !guardada.id) {
            throw new Error("Respuesta de guardado incompleta.");
        }

        plantillaCargada = {
            id: guardada.id,
            cooperativa_id: cooperativaId,
            bus_id: configuracion.bus_id,
            tipo_bus: configuracion.tipo_bus,
            numero_pisos: configuracion.numero_pisos,
            total_asientos: configuracion.total_asientos,
            actualizado_en: guardada.actualizado_en,
            pisos: configuracion.pisos
        };

        plantillasCooperativa = [
            ...plantillasCooperativa.filter(function (plantilla) {
                return configuracion.alcance === "bus"
                    ? plantilla.bus_id !== configuracion.bus_id
                    : plantilla.bus_id ||
                      claveTipo(plantilla.tipo_bus) !== configuracion.clave;
            }),
            plantillaCargada
        ];

        // Actualiza la cantidad de buses con esta plantilla.
        try {
            busesCooperativa =
                await obtenerBusesDeCooperativa(cooperativaId);
        } catch (errorBuses) {
            console.error("No se pudo refrescar la lista de buses:", errorBuses);
        }

        llenarSugerencias();   // también actualiza la lista de guardadas
        actualizarInfoBuses();
        actualizarTextoResumen();

        const asignados = Number(guardada.buses_asignados ?? 0);

        mostrarMensaje(
            configuracion.alcance === "bus"
                ? "Plantilla propia guardada para el bus " +
                  (busesCooperativa.find(b => b.id === configuracion.bus_id)?.placa ?? "") + "."
                : "Plantilla de «" + configuracion.tipo_bus + "» guardada. " +
                  (
                      asignados
                          ? "La usan " + asignados +
                            (asignados === 1 ? " bus." : " buses.")
                          : "Todavía no hay buses de este tipo; se asignará " +
                            "a los que registres."
                  ),
            "success"
        );

        // El mensaje está arriba: llévalo a la vista para que se note.
        mensaje.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        console.error("Error al guardar la plantilla:", error);

        if (error?.code === "40001") {
            // Otra sesión cambió la plantilla: hay que volver a cargarla.
            try {
                plantillasCooperativa =
                    await obtenerPlantillasDeCooperativa(cooperativaId);
            } catch (errorRecarga) {
                console.error("No se pudo recargar:", errorRecarga);
            }

            campoTipo.value = "";
            busId = "";
            selectorBus.value = "";
            llenarSelectorBuses();
            plantillaCargada = null;

            limpiarResumen();
            aplicarCampos(null);
            actualizarInfoBuses();
            renderizarGuardadas();

            mostrarMensaje(
                "La plantilla cambió en otra sesión. Vuelve a elegir el " +
                "tipo de bus o el bus para cargar la versión actual.",
                "warning"
            );
        } else if (error?.code === "42501") {
            mostrarMensaje(
                "Tu cuenta no tiene permiso para guardar plantillas " +
                "de esta cooperativa.",
                "danger"
            );
        } else if (error?.code === "55006") {
            mostrarMensaje(error.message, "warning");
        } else if (error?.code === "22023") {
            mostrarMensaje(
                error.message ||
                "Revisa la cantidad de asientos, las filas y las columnas " +
                "de cada piso y genera otra vez la vista previa.",
                "warning"
            );
        } else {
            mostrarMensaje(
                "No se pudo confirmar el guardado. Revisa tu conexión " +
                "e inténtalo de nuevo.",
                "danger"
            );
        }
    } finally {
        guardando = false;
        controles.disabled = false;

        formulario.removeAttribute("aria-busy");
        botonGuardar.textContent = "Guardar plantilla";

        actualizarBotonGuardar();
    }
}

// Generar la vista previa desde el formulario.

formulario.addEventListener("submit", function (evento) {
    evento.preventDefault();

    if (controles.disabled) return;

    formulario.classList.add("was-validated");
    validarCapacidadTotal();

    if (!formulario.reportValidity()) return;

    if (!cooperativaId) {
        mostrarMensaje("Selecciona una cooperativa.", "warning");
        return;
    }

    if (alcance === "bus" && !busId) {
        mostrarMensaje("Selecciona un bus.", "warning");
        return;
    }

    try {
        const datos = Array.from(
            { length: Number(numeroPisos.value) },
            (_, indice) => leerPiso(indice + 1)
        );

        const pisos = crearPisos(datos);

        const total = pisos.reduce(
            (suma, piso) => suma + piso.asientos.length,
            0
        );

        const tipo = campoTipo.value.trim();

        configuracionActual = {
            cooperativa_id: cooperativaId,
            alcance,
            bus_id: alcance === "bus" ? busId : null,
            tipo_bus: tipo,
            clave: claveTipo(tipo),
            numero_pisos: pisos.length,
            total_asientos: total,
            pisos
        };

        seleccionados.clear();

        mostrarConfiguracion();
        mensaje.classList.add("d-none");

        document.getElementById("tituloResumen").focus();
    } catch (error) {
        mostrarMensaje(error.message, "warning");
    }
});

// Eventos.

selectorCooperativa.addEventListener("change", cambiarCooperativa);

campoTipo.addEventListener("change", cambiarTipo);
campoTipo.addEventListener("input", actualizarBotonGuardar);

radiosAlcance.forEach(function (radio) {
    radio.addEventListener("change", cambiarAlcance);
});

selectorBus.addEventListener("change", cambiarBus);
botonQuitar.addEventListener("click", quitarPropia);

numeroPisos.addEventListener("change", cambiarNumeroPisos);

[1, 2].forEach(function (numero) {
    campo("cantidad", numero).addEventListener("input", function () {
        ajustarPiso(numero);
    });

    campo("columnas", numero).addEventListener("input", function () {
        ajustarPiso(numero);
    });

    campo("filas", numero).addEventListener("input", function () {
        ajustarPiso(numero, "filas");
    });

    campo("central", numero).addEventListener("change", function () {
        ajustarPiso(numero, "central");
    });
});

mapaPlantilla.addEventListener("keydown", navegarAsientos);

cantidadBoletos.addEventListener("input", limpiarSeleccion);
botonLimpiar.addEventListener("click", limpiarSeleccion);
botonGuardar.addEventListener("click", guardarPlantillaActual);

// Inicio y comprobación del acceso.

async function iniciar() {
    controles.disabled = true;

    try {
        // La guarda comprueba sesión y rol, oculta la página hasta confirmar y
        // revalida si el usuario vuelve con el botón "atrás".
        const rol = await exigirRoles(["administrador", "cooperativa"]);

        if (!rol) return;

        mostrarMensaje("Cargando cooperativas...");

        const cooperativas = await obtenerCooperativasPermitidas(rol);

        if (cooperativas.length === 0) {
            mostrarMensaje(
                rol === "administrador"
                    ? "No hay cooperativas registradas. Crea una primero."
                    : "Tu cuenta no está asignada a ninguna cooperativa. " +
                      "Solicita al administrador que revise tu asignación.",
                "warning"
            );

            return;
        }

        llenarSelectorCooperativas(cooperativas);
        controles.disabled = false;

        if (cooperativas.length === 1) {
            selectorCooperativa.value = cooperativas[0].id;
            await cambiarCooperativa();
        } else {
            mostrarMensaje("Selecciona la cooperativa para empezar.");
        }

        actualizarBotonGuardar();
    } catch (error) {
        console.error(
            "Error al cargar la plantilla de asientos:",
            error
        );

        mostrarMensaje(
            "No se pudieron cargar las cooperativas. Revisa tu conexión y vuelve a intentar.",
            "danger"
        );
    }
}

actualizarTotal();
renderizarGuardadas();
iniciar();
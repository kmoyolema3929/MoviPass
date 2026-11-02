import { supabase } from "./supabaseClient.js";
import { obtenerSesion, obtenerRol } from "./auth.js";
import { obtenerPlantillaGuardada } from "./asientosService.js";
let busesDisponibles = [];
let configuracionActual = null;
let segundoPisoPreparado = false;
let busEnEdicion = "";

const configuracionesPorBus = new Map();
const versionesPorBus = new Map();
let solicitudPlantilla = 0;
const seleccionados = new Set();

const formulario = document.getElementById("formPlantilla");
const controles = document.getElementById("configuracion");
const selectorBus = document.getElementById("bus");

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

function mostrarMensaje(texto, tipo = "info") {
    mensaje.textContent = texto;
    mensaje.className = `alert alert-${tipo}`;
}

function enteroEnRango(valor, minimo, maximo) {
    return Number.isInteger(valor) &&
        valor >= minimo &&
        valor <= maximo;
}

function leerPiso(numero) {
    return {
        numero,
        cantidad: Number(
            document.getElementById("cantidad" + numero).value
        ),
        filas: Number(
            document.getElementById("filas" + numero).value
        ),
        columnas: Number(
            document.getElementById("columnas" + numero).value
        )
    };
}

function actualizarTotal() {
    const datos = Array.from(
        { length: Number(numeroPisos.value) },
        (_, indice) => leerPiso(indice + 1)
    );

    const valido = datos.every(function (piso) {
        return enteroEnRango(piso.cantidad, 1, 60);
    });

    const total = datos.reduce(function (suma, piso) {
        return suma + piso.cantidad;
    }, 0);

    const minimo = datos.length === 2 ? 40 : 1;
    const dentroDelRango =
        valido && enteroEnRango(total, minimo, 60);

    totalConfigurado.className =
        "alert " + (dentroDelRango ? "alert-info" : "alert-warning");

    totalConfigurado.textContent = valido
        ? "Total del bus: " + total + " asientos. " +
          (
              datos.length === 2
                  ? "Los dos pisos deben sumar entre 40 y 60."
                  : "Máximo 60 asientos."
          )
        : "Completa la cantidad de asientos de cada piso.";
        validarCapacidadTotal();
}

function limpiarResumen() {
    configuracionActual = null;
    seleccionados.clear();

    mapaPlantilla.replaceChildren();
    botonesPisos.replaceChildren();

    resumen.classList.add("d-none");
    formulario.classList.remove("was-validated");
}

function ajustarPiso(numero, desdeFilas = false) {
    const campoCantidad =
        document.getElementById("cantidad" + numero);

    const campoFilas =
        document.getElementById("filas" + numero);

    const datos = leerPiso(numero);

    if (enteroEnRango(datos.columnas, 1, 4)) {
        const maximoFilas = Math.ceil(60 / datos.columnas);
        campoFilas.max = String(maximoFilas);

        if (
            desdeFilas &&
            enteroEnRango(datos.filas, 1, maximoFilas)
        ) {
            campoCantidad.value = String(
                Math.min(datos.filas * datos.columnas, 60)
            );
        } else if (
            !desdeFilas &&
            enteroEnRango(datos.cantidad, 1, 60)
        ) {
            campoFilas.value = String(
                Math.ceil(datos.cantidad / datos.columnas)
            );
        }
    }

    limpiarResumen();
    actualizarTotal();
    guardarBorradorBus();
}

function cambiarNumeroPisos() {
    const usaDosPisos = numeroPisos.value === "2";
    const segundo = document.getElementById("configuracionPiso2");

    segundo.hidden = !usaDosPisos;
    segundo.disabled = !usaDosPisos;

    if (usaDosPisos && !segundoPisoPreparado) {
        const cantidadAnterior = Number(
            document.getElementById("cantidad1").value
        );

        const total = enteroEnRango(cantidadAnterior, 1, 60)
            ? Math.max(40, cantidadAnterior)
            : 40;

        document.getElementById("cantidad1").value =
            String(Math.floor(total / 2));

        document.getElementById("cantidad2").value =
            String(Math.ceil(total / 2));

        segundoPisoPreparado = true;
    }

    ajustarPiso(1);

    if (usaDosPisos) {
        ajustarPiso(2);
    }
}

function guardarBorradorBus() {
if (!busEnEdicion || !versionesPorBus.has(busEnEdicion)) return;
    const campos = [1, 2].map(function (numero) {
        return {
            cantidad: document.getElementById(
                "cantidad" + numero
            ).value,
            filas: document.getElementById(
                "filas" + numero
            ).value,
            columnas: document.getElementById(
                "columnas" + numero
            ).value
        };
    });

    const configuracion =
        configuracionActual?.bus_id === busEnEdicion
            ? structuredClone(configuracionActual)
            : null;

    configuracionesPorBus.set(busEnEdicion, {
        numeroPisos: numeroPisos.value,
        segundoPisoPreparado,
        campos,
        configuracion,
        vista: mapaPlantilla.dataset.vista ?? "1"
    });
}

function restaurarCamposBus(borrador) {
    numeroPisos.value = borrador?.numeroPisos ?? "1";

    segundoPisoPreparado =
        borrador?.segundoPisoPreparado ?? false;

    [1, 2].forEach(function (numero) {
        ["cantidad", "filas", "columnas"].forEach(function (nombre) {
            const campo = document.getElementById(nombre + numero);

            campo.value =
                borrador?.campos[numero - 1]?.[nombre] ??
                campo.defaultValue;
        });

        const columnas = Number(
            document.getElementById("columnas" + numero).value
        );

        document.getElementById("filas" + numero).max = String(
            enteroEnRango(columnas, 1, 4)
                ? Math.ceil(60 / columnas)
                : 60
        );
    });

    const segundoPiso = document.getElementById(
        "configuracionPiso2"
    );

    segundoPiso.hidden = numeroPisos.value !== "2";
    segundoPiso.disabled = numeroPisos.value !== "2";

    actualizarTotal();
}

function actualizarTextoResumen(bus) {
    textoResumen.textContent =
        "Bus " + bus.placa + ": " +
        configuracionActual.numero_pisos +
        (
            configuracionActual.numero_pisos === 1
                ? " piso, "
                : " pisos, "
        ) +
        configuracionActual.total_asientos +
        " asientos en total.";
}

async function cambiarBus() {
    guardarBorradorBus();

    const solicitud = ++solicitudPlantilla;

    busEnEdicion = selectorBus.value;
    limpiarResumen();

    mensaje.classList.add("d-none");
    controles.disabled = false;
    formulario.removeAttribute("aria-busy");

    const bus = busesDisponibles.find(
        bus => bus.id === busEnEdicion
    );

    let borrador = bus
        ? configuracionesPorBus.get(bus.id)
        : null;

    let cargadaDesdeSupabase = false;

    restaurarCamposBus(borrador);

    if (!bus) return;

    if (!borrador) {
        controles.disabled = true;
        formulario.setAttribute("aria-busy", "true");

        mostrarMensaje(
            "Cargando la plantilla del bus " + bus.placa + "..."
        );

        try {
            const guardada = await obtenerPlantillaGuardada(bus.id);

            // Ignorar una respuesta si ya se seleccionó otro bus.
            if (solicitud !== solicitudPlantilla) return;

            versionesPorBus.set(
                bus.id,
                guardada?.actualizado_en ?? null
            );

            if (!guardada) {
                mostrarMensaje(
                    "Este bus todavía no tiene una plantilla guardada. " +
                    "Configura sus asientos y genera la vista previa."
                );

                return;
            }

            borrador = {
                numeroPisos: String(guardada.numero_pisos),

                segundoPisoPreparado:
                    guardada.numero_pisos === 2,

                campos: [1, 2].map(function (numero) {
                    const piso = guardada.pisos.find(
                        piso => piso.numero === numero
                    );

                    return {
                        cantidad: piso
                            ? String(piso.asientos.length)
                            : document.getElementById(
                                "cantidad" + numero
                            ).defaultValue,

                        filas: piso
                            ? String(piso.filas)
                            : document.getElementById(
                                "filas" + numero
                            ).defaultValue,

                        columnas: piso
                            ? String(piso.columnas)
                            : document.getElementById(
                                "columnas" + numero
                            ).defaultValue
                    };
                }),

                configuracion: guardada,
                vista: null
            };

            configuracionesPorBus.set(bus.id, borrador);

            restaurarCamposBus(borrador);
            cargadaDesdeSupabase = true;
        } catch (error) {
            if (solicitud !== solicitudPlantilla) return;

            versionesPorBus.delete(bus.id);

            console.error(
                "No se pudo cargar la plantilla:",
                error
            );

            mostrarMensaje(
                "No se pudo cargar la plantilla. Selecciona otro bus " +
                "y vuelve a elegir este para reintentar.",
                "danger"
            );

            return;
        } finally {
            if (solicitud === solicitudPlantilla) {
                controles.disabled = false;
                formulario.removeAttribute("aria-busy");
            }
        }
    }

    if (!borrador.configuracion) {
        mostrarMensaje(
            "Borrador recuperado para el bus " + bus.placa +
            ". Revisa los campos y genera la vista previa."
        );

        return;
    }

    configuracionActual = structuredClone(
        borrador.configuracion
    );

    cantidadBoletos.max = String(
        configuracionActual.total_asientos
    );

    cantidadBoletos.value = "1";

    actualizarTextoResumen(bus);
    dibujarVistaPrevia();
    actualizarContador();

    const vistaValida =
        borrador.vista === "1" ||
        (
            configuracionActual.numero_pisos === 2 &&
            ["2", "ambos"].includes(borrador.vista)
        );

    if (vistaValida) {
        mostrarPiso(borrador.vista);
    }

    resumen.classList.remove("d-none");

    mostrarMensaje(
        cargadaDesdeSupabase
            ? "Plantilla guardada cargada para el bus " +
              bus.placa + "."
            : "Borrador recuperado para el bus " + bus.placa +
              ". Los cambios nuevos todavía no se han guardado."
    );
}

function llenarSelectorBuses() {
    const opcionInicial = document.createElement("option");

    opcionInicial.value = "";
    opcionInicial.textContent = "Selecciona un bus";

    selectorBus.replaceChildren(opcionInicial);

    busesDisponibles.forEach(function (bus) {
        const opcion = document.createElement("option");

        const cooperativa =
            bus.cooperativas?.nombre ?? "Cooperativa no disponible";

        opcion.value = bus.id;
        opcion.textContent =
            `${bus.placa} — ${cooperativa} (${bus.tipo_bus})`;

        selectorBus.appendChild(opcion);
    });
}

async function cargarBuses() {
    const { data, error } = await supabase
        .from("buses")
        .select(
            "id, placa, tipo_bus, cooperativa_id, cooperativas(nombre)"
        )
        .order("placa");

    if (error) throw error;

    busesDisponibles = data ?? [];
    llenarSelectorBuses();
}

function crearPisos(datos) {
    if (
        !Array.isArray(datos) ||
        !enteroEnRango(datos.length, 1, 2)
    ) {
        throw new RangeError("Selecciona uno o dos pisos.");
    }

    datos.forEach(function (piso) {
        if (
            !enteroEnRango(piso.cantidad, 1, 60) ||
            !enteroEnRango(piso.columnas, 1, 4) ||
            !Number.isInteger(piso.filas) ||
            piso.filas !== Math.ceil(piso.cantidad / piso.columnas)
        ) {
            throw new RangeError(
                "Revisa los asientos, filas y columnas de cada piso."
            );
        }
    });

    const total = datos.reduce(function (suma, piso) {
        return suma + piso.cantidad;
    }, 0);

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
            (_, indice) => ({
                numero: numeroSiguiente++,
                piso: numeroPiso,
                fila: Math.floor(indice / piso.columnas) + 1,
                columna: indice % piso.columnas + 1,
                tipo: datos.length === 2 && numeroPiso === 1
                    ? "vip"
                    : "normal"
            })
        );

        return {
            numero: numeroPiso,
            filas: piso.filas,
            columnas: piso.columnas,
            asientos
        };
    });
}

function alternarSeleccion(numero, limite, seleccionados) {
    if (seleccionados.has(numero)) {
        seleccionados.delete(numero);
        return true;
    }

    if (seleccionados.size >= limite) {
        return false;
    }

    seleccionados.add(numero);
    return true;
}

function actualizarContador(aviso = "") {
    if (!configuracionActual) return;

    let totalVip = 0;

    configuracionActual.pisos.forEach(function (piso) {
        const vip = piso.asientos.filter(function (asiento) {
            return asiento.tipo === "vip";
        }).length;

        const normales = piso.asientos.length - vip;

        const elegidos = piso.asientos.filter(function (asiento) {
            return seleccionados.has(asiento.numero);
        }).length;

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

function actualizarBoton(boton) {
    const numero = Number(boton.dataset.numero);

    const piso = configuracionActual?.pisos.find(function (piso) {
        return piso.numero === Number(boton.dataset.piso);
    });

    const asiento = piso?.asientos.find(function (asiento) {
        return asiento.numero === numero;
    });

    if (!asiento) return;

    const elegido = seleccionados.has(numero);
    const tipo = asiento.tipo === "vip" ? "VIP" : "Normal";

    boton.dataset.tipo = asiento.tipo;
    boton.querySelector("small").textContent = tipo;

    boton.setAttribute("aria-pressed", String(elegido));

    boton.setAttribute(
        "aria-label",
        "Asiento " + numero +
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
        piso.asientos[piso.asientos.length - 1].numero + ".";

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

    const centro = Math.ceil(piso.columnas / 2);

    const anchos = Array(piso.columnas)
        .fill("minmax(0, 1fr)");

    if (piso.columnas > 1) {
        anchos.splice(centro, 0, "1rem");
    }

    for (let fila = 1; fila <= piso.filas; fila++) {
        const filaVisual = document.createElement("div");

        filaVisual.className = "plantilla-fila";
        filaVisual.style.gridTemplateColumns = anchos.join(" ");

        filaVisual.setAttribute("role", "group");
        filaVisual.setAttribute(
            "aria-label",
            "Piso " + piso.numero + ", fila " + fila
        );

        for (
            let columna = 1;
            columna <= piso.columnas;
            columna++
        ) {
            const indice =
                (fila - 1) * piso.columnas + columna - 1;

            const asiento = piso.asientos[indice];

            if (asiento) {
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

                filaVisual.appendChild(boton);
            } else {
                const hueco = document.createElement("span");

                hueco.setAttribute("aria-hidden", "true");
                filaVisual.appendChild(hueco);
            }

            if (
                columna === centro &&
                piso.columnas > 1
            ) {
                const pasillo = document.createElement("span");

                pasillo.className = "plantilla-pasillo";
                pasillo.setAttribute("aria-hidden", "true");

                filaVisual.appendChild(pasillo);
            }
        }

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
}

formulario.addEventListener("submit", function (evento) {
    evento.preventDefault();

    if (controles.disabled) return;

    formulario.classList.add("was-validated");

   validarCapacidadTotal();

if (!formulario.reportValidity()) return;

    const busSeleccionado = busesDisponibles.find(function (bus) {
        return bus.id === selectorBus.value;
    });

    if (!busSeleccionado) {
        mostrarMensaje(
            "Selecciona un bus disponible.",
            "warning"
        );

        return;
    }

    try {
        const datos = Array.from(
            { length: Number(numeroPisos.value) },
            (_, indice) => leerPiso(indice + 1)
        );

        const pisos = crearPisos(datos);

        const total = pisos.reduce(function (suma, piso) {
            return suma + piso.asientos.length;
        }, 0);

        configuracionActual = {
            bus_id: busSeleccionado.id,
            numero_pisos: pisos.length,
            total_asientos: total,
            pisos
        };

        seleccionados.clear();

        cantidadBoletos.max = String(total);
        cantidadBoletos.value = "1";

        busEnEdicion = busSeleccionado.id;
        actualizarTextoResumen(busSeleccionado);

        dibujarVistaPrevia();
        actualizarContador();
resumen.classList.remove("d-none");
mensaje.classList.add("d-none");

guardarBorradorBus();

document.getElementById("tituloResumen").focus();
    } catch (error) {
        mostrarMensaje(error.message, "warning");
    }
});
mapaPlantilla.addEventListener("keydown", navegarAsientos);

selectorBus.addEventListener("change", cambiarBus);

numeroPisos.addEventListener(
    "change",
    cambiarNumeroPisos
);

[1, 2].forEach(function (numero) {
    document
        .getElementById("cantidad" + numero)
        .addEventListener("input", function () {
            ajustarPiso(numero);
        });

    document
        .getElementById("columnas" + numero)
        .addEventListener("input", function () {
            ajustarPiso(numero);
        });

    document
        .getElementById("filas" + numero)
        .addEventListener("input", function () {
            ajustarPiso(numero, true);
        });
});

cantidadBoletos.addEventListener(
    "input",
    limpiarSeleccion
);

botonLimpiar.addEventListener(
    "click",
    limpiarSeleccion
);

actualizarTotal();

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
        console.error(
            "Error al cargar la plantilla de asientos:",
            error
        );

        mostrarMensaje(
            "No se pudieron cargar los buses. Revisa tu conexión y vuelve a intentar.",
            "danger"
        );
    }
}
function actualizarValidezCampos() {
    const mostrarErrores =
        formulario.classList.contains("was-validated");

    formulario.querySelectorAll("input, select").forEach(function (campo) {
        if (!mostrarErrores || campo.matches(":disabled")) {
            campo.removeAttribute("aria-invalid");
        } else {
            campo.setAttribute(
                "aria-invalid",
                String(!campo.validity.valid)
            );
        }
    });
}

function validarCapacidadTotal() {
    [1, 2].forEach(function (numero) {
        document
            .getElementById("cantidad" + numero)
            .setCustomValidity("");
    });

    const pisos = Number(numeroPisos.value);

    if (!enteroEnRango(pisos, 1, 2)) {
        actualizarValidezCampos();
        return false;
    }

    const cantidades = Array.from(
        { length: pisos },
        (_, indice) => Number(
            document.getElementById("cantidad" + (indice + 1)).value
        )
    );

    const individualesValidas = cantidades.every(function (cantidad) {
        return enteroEnRango(cantidad, 1, 60);
    });

    if (!individualesValidas) {
        actualizarValidezCampos();
        return false;
    }

    const total = cantidades.reduce(
        (suma, cantidad) => suma + cantidad,
        0
    );

    const minimo = pisos === 2 ? 40 : 1;
    const valido = enteroEnRango(total, minimo, 60);

    if (!valido) {
        document.getElementById("cantidad" + pisos).setCustomValidity(
            "Los pisos suman " + total +
            " asientos. El total debe estar entre " +
            minimo + " y 60."
        );
    }

    actualizarValidezCampos();

    return valido;
}

function navegarAsientos(evento) {
    if (evento.altKey || evento.ctrlKey || evento.metaKey) return;

    const desplazamientos = {
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0]
    };

    const desplazamiento = desplazamientos[evento.key];

    const boton = evento.target.closest(
        "button[data-numero]"
    );

    if (!desplazamiento || !boton || !configuracionActual) return;

    const piso = configuracionActual.pisos.find(function (piso) {
        return piso.numero === Number(boton.dataset.piso);
    });

    const actual = piso?.asientos.find(function (asiento) {
        return asiento.numero === Number(boton.dataset.numero);
    });

    if (!actual) return;

    evento.preventDefault();

    const destino = piso.asientos.find(function (asiento) {
        return asiento.fila === actual.fila + desplazamiento[0] &&
            asiento.columna === actual.columna + desplazamiento[1];
    });

    if (!destino) return;

    mapaPlantilla.querySelector(
        'button[data-piso="' + piso.numero +
        '"][data-numero="' + destino.numero + '"]'
    )?.focus();
   
}
iniciar();
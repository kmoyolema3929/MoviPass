import { supabase } from "./supabaseClient.js";
import { exigirRoles } from "./guardas.js";
import { crearLote } from "./buses-lote.js";
import { normalizarPlaca, prepararCampoPlaca } from "./validaciones.js";
import { llenarCombo, ponerOpciones } from "./combos.js";
import { obtenerGruposBus } from "./gruposBus.js";
import { obtenerMarcasCarroceria, obtenerMarcasChasis } from "./catalogos.js";
import {
    CREAR_PLANTILLA,
    FOTO,
    datosDelBus,
    esMarcaOtro,
    mensajeErrorBus,
    revisarBus,
    rutaFoto,
    validarFoto
} from "./formularioBus.js";

// Cambio 6, parte 3: tipo_bus es el nombre del grupo (lo copia la base).
const columnas = [
    "id", "cooperativa_id", "numero_interno", "numero_interno_provisional", "placa", "dueno",
    "grupo_id", "tipo_bus", "plantilla_id", "marca_carroceria_id", "marca_carroceria_otra",
    "marca_chasis_id", "marca_chasis_otra", "chasis", "foto_ruta", "usuario_bus_id"
].join(", ");

const BORRADOR = "borradorBus";

// Cooperativa del gerente: { id, nombre }. Todo lo que se ve y se guarda es de ella.
let cooperativaGerente = null;
let buses = [];
let ocupado = false;
let accesoPermitido = false;

// Listas de los combos (null = todavía no se cargaron).
const listas = { grupos: null, plantillas: null, marcasCarroceria: null, marcasChasis: null, usuariosBus: null };

const $ = id => document.getElementById(id);
const tabla = $("tablaBuses");
const formulario = $("formBus");
const busId = $("busId");
const campos = {
    numeroInterno: $("numeroInterno"),
    placa: $("placa"),
    grupoId: $("grupoBus"),
    plantillaId: $("plantillaBus"),
    marcaCarroceriaId: $("marcaCarroceria"),
    marcaCarroceriaOtra: $("marcaCarroceriaOtra"),
    marcaChasisId: $("marcaChasis"),
    marcaChasisOtra: $("marcaChasisOtra"),
    chasis: $("chasis"),
    dueno: $("dueno"),
    usuarioBusId: $("usuarioBus")
};
const fotoBus = $("fotoBus");
const errorFoto = $("errorFoto");
const vistaFoto = $("vistaFoto");
const imagenFoto = $("imagenFoto");
const quitarFoto = $("quitarFoto");
const mensaje = $("mensaje");
const nombreCoop = $("nombreCoop");
const tituloModal = $("tituloModalBus");
const botonNuevo = $("btnNuevoBus");
const botonGuardar = $("btnGuardarBus");
const elementoModal = $("modalBus");
const modal = new bootstrap.Modal(elementoModal);

const errorFormulario = document.createElement("div");
errorFormulario.className = "alert alert-danger d-none";
errorFormulario.setAttribute("role", "alert");
formulario.querySelector(".modal-body").prepend(errorFormulario);

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

function mostrarMensaje(texto, tipo = "info") {
    mensaje.textContent = texto;
    mensaje.className = `alert alert-${tipo}`;
}

function mostrarErrorFormulario(texto) {
    errorFormulario.textContent = texto;
    errorFormulario.classList.toggle("d-none", !texto);
}

function urlFoto(ruta) {
    return ruta ? supabase.storage.from(FOTO.bucket).getPublicUrl(ruta).data.publicUrl : "";
}

const nombrePlantilla = id => listas.plantillas?.find(p => p.id === id)?.nombre ?? "";

function valoresDelFormulario() {
    return Object.fromEntries(Object.entries(campos).map(([clave, campo]) => [clave, campo.value]));
}

function contextoRevision() {
    return {
        buses,
        idActual: busId.value,
        marcasCarroceria: listas.marcasCarroceria ?? [],
        marcasChasis: listas.marcasChasis ?? []
    };
}

function cambiarOcupado(valor) {
    ocupado = valor;

    const sinCooperativa = !cooperativaGerente;

    botonNuevo.disabled = valor || !accesoPermitido || sinCooperativa;
    lote.bloquear(botonNuevo.disabled);
    botonGuardar.disabled = valor || !accesoPermitido || sinCooperativa;

    botonGuardar.textContent = valor
        ? "Procesando..."
        : busId.value ? "Actualizar bus" : "Guardar bus";

    // Los combos sin opciones (o que no cargaron) siguen deshabilitados.
    formulario.querySelectorAll("input").forEach(campo => { campo.disabled = valor; });
    formulario.querySelectorAll("select").forEach(select => {
        if (valor) select.disabled = true;
        else select.disabled = select.options.length <= 1 && !select.options[0]?.value && select.options[0]?.disabled;
    });

    tabla.querySelectorAll("button").forEach(boton => { boton.disabled = valor; });
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

// ---------------------------------------------------------------------
// Combos
// ---------------------------------------------------------------------

function ponerPlantillas(seleccionada) {
    const select = campos.plantillaId;
    if (!listas.plantillas) return;

    if (listas.plantillas.length === 0) {
        const inicial = new Option("Aún no tienes plantillas", "", true, true);
        inicial.disabled = true;
        select.replaceChildren(inicial);
        select.disabled = false;
    } else {
        ponerOpciones(select, listas.plantillas, {
            inicial: "Selecciona una plantilla...",
            porDefecto: seleccionada
        });
    }

    select.appendChild(new Option("➕ Crear nueva plantilla...", CREAR_PLANTILLA));
}

/** Pone las opciones de todos los combos con los valores del bus (o vacíos). */
function ponerCombos(bus = null) {
    if (listas.grupos) {
        ponerOpciones(campos.grupoId, listas.grupos, {
            inicial: "Selecciona un grupo...",
            porDefecto: bus?.grupo_id ?? "",
            vacio: "Primero crea un grupo de bus"
        });
    }

    ponerPlantillas(bus?.plantilla_id ?? "");

    if (listas.marcasCarroceria) {
        ponerOpciones(campos.marcaCarroceriaId, listas.marcasCarroceria, {
            inicial: "Selecciona una marca...",
            porDefecto: bus?.marca_carroceria_id ?? ""
        });
    }

    if (listas.marcasChasis) {
        ponerOpciones(campos.marcaChasisId, listas.marcasChasis, {
            todos: "Sin especificar",
            porDefecto: bus?.marca_chasis_id ?? ""
        });
    }

    if (listas.usuariosBus) {
        ponerOpciones(campos.usuarioBusId, listas.usuariosBus, {
            todos: listas.usuariosBus.length ? "Sin asignar" : "Sin asignar (aún no hay usuarios bus)",
            valor: u => u.id,
            texto: u => `${u.apellidos} ${u.nombres}${u.estado === "suspendido" ? " (suspendido)" : ""}`,
            porDefecto: bus?.usuario_bus_id ?? ""
        });
    }

    mostrarMarcasOtra();
}

/** Muestra el campo de texto cuando la marca elegida es "Otro". */
function mostrarMarcasOtra() {
    const carroceriaOtra = esMarcaOtro(listas.marcasCarroceria, campos.marcaCarroceriaId.value);
    const chasisOtra = esMarcaOtro(listas.marcasChasis, campos.marcaChasisId.value);

    $("grupoCarroceriaOtra").classList.toggle("d-none", !carroceriaOtra);
    $("grupoChasisOtra").classList.toggle("d-none", !chasisOtra);
    campos.marcaCarroceriaOtra.required = carroceriaOtra;
    campos.marcaChasisOtra.required = chasisOtra;
}

/** Carga un combo con su lista; si falla, el combo muestra «Reintentar». */
async function cargarCombo(clave, select, cargar, config) {
    const alCargar = lista => {
        listas[clave] = lista;
        // Si el formulario está abierto, conserva lo elegido.
        const actual = buses.find(b => b.id === busId.value) ?? null;
        ponerCombos(actual);
    };

    const lista = await llenarCombo(select, { ...config, cargar, alReintentar: alCargar });
    if (lista) listas[clave] = lista;
}

async function obtenerPlantillas() {
    const { data, error } = await supabase
        .from("plantillas_bus")
        .select("id, nombre, total_asientos")
        .eq("cooperativa_id", cooperativaGerente.id)
        .order("nombre");

    if (error) throw error;
    return (data ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

async function obtenerUsuariosBus() {
    const { data, error } = await supabase.rpc("obtener_usuarios_bus_de_cooperativa", {
        p_cooperativa_id: cooperativaGerente.id
    });

    if (error) throw error;
    return data ?? [];
}

async function cargarCombos() {
    await Promise.all([
        cargarCombo("grupos", campos.grupoId, () => obtenerGruposBus(cooperativaGerente.id), {
            inicial: "Selecciona un grupo...", vacio: "Primero crea un grupo de bus", error: "No se pudieron cargar los grupos."
        }),
        cargarCombo("plantillas", campos.plantillaId, obtenerPlantillas, {
            inicial: "Selecciona una plantilla...", error: "No se pudieron cargar las plantillas."
        }),
        cargarCombo("marcasCarroceria", campos.marcaCarroceriaId, obtenerMarcasCarroceria, {
            inicial: "Selecciona una marca...", error: "No se pudieron cargar las marcas."
        }),
        cargarCombo("marcasChasis", campos.marcaChasisId, obtenerMarcasChasis, {
            todos: "Sin especificar", error: "No se pudieron cargar las marcas."
        }),
        cargarCombo("usuariosBus", campos.usuarioBusId, obtenerUsuariosBus, {
            todos: "Sin asignar", valor: u => u.id, texto: u => `${u.apellidos} ${u.nombres}`,
            error: "No se pudieron cargar los usuarios bus."
        })
    ]);

    ponerCombos(null);
}

// ---------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------

function limpiarErrores() {
    mostrarErrorFormulario("");
    Object.values(campos).forEach(campo => campo.classList.remove("is-invalid"));
    fotoBus.classList.remove("is-invalid");
}

function mostrarErrores(errores) {
    let primero = null;

    Object.entries(errores).forEach(([clave, texto]) => {
        const campo = campos[clave];
        if (!campo) return;

        campo.classList.add("is-invalid");
        const aviso = formulario.querySelector(`[data-error="${clave}"]`);
        if (aviso) aviso.textContent = texto;
        primero ??= campo;
    });

    primero?.focus();
}

function mostrarFotoActual(ruta) {
    quitarFoto.checked = false;
    $("grupoQuitarFoto").classList.toggle("d-none", !ruta);
    vistaFoto.classList.toggle("d-none", !ruta);
    imagenFoto.src = ruta ? urlFoto(ruta) : "";
}

function prepararFormulario() {
    formulario.reset();
    limpiarErrores();

    busId.value = "";
    tituloModal.textContent = "Nuevo bus";
    botonGuardar.textContent = "Guardar bus";
    errorFoto.textContent = "";

    ponerCombos(null);
    mostrarFotoActual(null);
}

function abrirEdicion(id) {
    if (ocupado || !accesoPermitido) return;

    const bus = buses.find(item => item.id === id);
    if (!bus) return;

    prepararFormulario();

    busId.value = bus.id;
    campos.numeroInterno.value = bus.numero_interno ?? "";
    campos.placa.value = bus.placa;
    campos.dueno.value = bus.dueno === "Por registrar" ? "" : bus.dueno ?? "";
    campos.chasis.value = bus.chasis ?? "";
    ponerCombos(bus);
    campos.marcaCarroceriaOtra.value = bus.marca_carroceria_otra ?? "";
    campos.marcaChasisOtra.value = bus.marca_chasis_otra ?? "";
    mostrarFotoActual(bus.foto_ruta);

    tituloModal.textContent = `Editar bus ${bus.numero_interno}`;
    botonGuardar.textContent = "Actualizar bus";

    modal.show();
}

function insignia(texto, clase) {
    const span = document.createElement("span");
    span.className = `badge ${clase} ms-1`;
    span.textContent = texto;
    return span;
}

function mostrarBuses() {
    if (buses.length === 0) {
        mostrarEstadoTabla("Aún no has registrado buses. Pulsa «Nuevo bus» o «Agregar varios» para empezar.");
        return;
    }

    tabla.replaceChildren();

    buses.forEach(function (bus) {
        const fila = document.createElement("tr");
        const celda = (texto, clase = "text-break") => {
            const td = document.createElement("td");
            td.className = clase;
            td.textContent = texto;
            fila.appendChild(td);
            return td;
        };

        const numero = celda(bus.numero_interno, "text-nowrap fw-semibold");
        if (bus.numero_interno_provisional) {
            numero.appendChild(insignia("provisional", "text-bg-warning"));
            numero.title = "Número provisional: edita el bus para poner el número interno real.";
        }

        const placa = celda(bus.placa, "text-nowrap");
        if (bus.foto_ruta) {
            const img = document.createElement("img");
            img.src = urlFoto(bus.foto_ruta);
            img.alt = "";
            img.className = "foto-bus-miniatura ms-2";
            img.loading = "lazy";
            placa.appendChild(img);
        }

        celda(bus.tipo_bus);

        const plantilla = celda(nombrePlantilla(bus.plantilla_id));
        if (!bus.plantilla_id) plantilla.appendChild(insignia("sin plantilla", "text-bg-danger"));

        const dueno = celda(bus.dueno === "Por registrar" ? "" : bus.dueno);
        if (bus.dueno === "Por registrar") dueno.appendChild(insignia("por registrar", "text-bg-warning"));

        const acciones = document.createElement("td");
        acciones.className = "text-nowrap";

        const botonEditar = document.createElement("button");
        botonEditar.type = "button";
        botonEditar.className = "btn btn-outline-primary btn-sm";
        botonEditar.textContent = "Editar";
        botonEditar.setAttribute("aria-label", `Editar bus ${bus.numero_interno} con placa ${bus.placa}`);
        botonEditar.addEventListener("click", () => abrirEdicion(bus.id));

        const botonEliminar = document.createElement("button");
        botonEliminar.type = "button";
        botonEliminar.className = "btn btn-outline-danger btn-sm ms-2";
        botonEliminar.textContent = "Eliminar";
        botonEliminar.setAttribute("aria-label", `Eliminar bus ${bus.numero_interno} con placa ${bus.placa}`);
        botonEliminar.addEventListener("click", () => eliminarBus(bus.id));

        acciones.append(botonEditar, botonEliminar);
        fila.appendChild(acciones);
        tabla.appendChild(fila);
    });
}

// Busca la cooperativa asignada al gerente en cooperativas_usuarios
async function obtenerCooperativaGerente() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) return null;

    const { data, error } = await supabase
        .from("cooperativas_usuarios")
        .select("cooperativa_id, cooperativas(nombre)")
        .eq("perfil_id", session.user.id)
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return { id: data.cooperativa_id, nombre: data.cooperativas?.nombre ?? "tu cooperativa" };
}

function ordenarBuses() {
    buses.sort((a, b) =>
        String(a.numero_interno).localeCompare(String(b.numero_interno), "es", { numeric: true }) ||
        a.placa.localeCompare(b.placa, "es"));
}

async function cargarBuses() {
    mostrarEstadoTabla("Cargando buses...");

    const { data, error } = await supabase
        .from("buses")
        .select(columnas)
        .eq("cooperativa_id", cooperativaGerente.id);

    if (error) throw error;

    buses = data ?? [];
    ordenarBuses();
    mostrarBuses();
}

async function borrarFoto(ruta) {
    if (!ruta) return;

    const { error } = await supabase.storage.from(FOTO.bucket).remove([ruta]);
    if (error) console.warn("No se pudo borrar la foto anterior:", error);
}

async function subirFoto(id, archivo) {
    const ruta = rutaFoto(cooperativaGerente.id, id, archivo);
    const { error } = await supabase.storage.from(FOTO.bucket).upload(ruta, archivo, {
        contentType: archivo.type,
        upsert: false
    });

    if (error) throw error;
    return ruta;
}

async function eliminarBus(id) {
    if (ocupado || !accesoPermitido) return;

    const bus = buses.find(item => item.id === id);
    if (!bus) return;

    const confirmado = window.confirm(
        `¿Deseas eliminar el bus ${bus.numero_interno} (placa ${bus.placa})? Esta acción no se puede deshacer.`
    );

    if (!confirmado) return;

    cambiarOcupado(true);

    try {
        const { data, error } = await supabase
            .from("buses")
            .delete()
            .eq("id", id)
            .eq("cooperativa_id", cooperativaGerente.id)
            .select("id")
            .single();

        if (error) throw error;

        await borrarFoto(bus.foto_ruta);
        buses = buses.filter(item => item.id !== data.id);

        mostrarBuses();
        mostrarMensaje("Bus eliminado correctamente.", "success");
    } catch (error) {
        console.error("Error al eliminar el bus:", error);

        mostrarMensaje(mensajeErrorBus(error, "eliminar"), "danger");
    } finally {
        cambiarOcupado(false);
    }
}

async function guardarBus(evento) {
    evento.preventDefault();

    if (ocupado || !accesoPermitido || !cooperativaGerente) return;

    limpiarErrores();

    const idActual = busId.value;
    const anterior = buses.find(bus => bus.id === idActual) ?? null;
    const valores = valoresDelFormulario();
    const errores = revisarBus(valores, contextoRevision());
    const archivo = fotoBus.files?.[0] ?? null;
    const problemaFoto = validarFoto(archivo);

    campos.placa.value = normalizarPlaca(campos.placa.value).placa;

    if (problemaFoto) {
        fotoBus.classList.add("is-invalid");
        errorFoto.textContent = problemaFoto;
    }

    if (Object.keys(errores).length || problemaFoto) {
        mostrarErrores(errores);
        mostrarErrorFormulario("Revisa los campos marcados en rojo.");
        return;
    }

    const datos = { ...datosDelBus(valores, contextoRevision()), cooperativa_id: cooperativaGerente.id };

    cambiarOcupado(true);

    let guardado = false;
    let fotoNueva = null;
    let aviso = "";

    try {
        let data;

        if (idActual) {
            // Foto nueva: se sube primero; la anterior se borra cuando el bus ya se guardó.
            if (archivo) fotoNueva = await subirFoto(idActual, archivo);
            if (fotoNueva) datos.foto_ruta = fotoNueva;
            else if (quitarFoto.checked) datos.foto_ruta = null;

            const respuesta = await supabase
                .from("buses")
                .update(datos)
                .eq("id", idActual)
                .eq("cooperativa_id", cooperativaGerente.id)
                .select(columnas)
                .single();

            if (respuesta.error) throw respuesta.error;
            data = respuesta.data;

            if (anterior?.foto_ruta && anterior.foto_ruta !== data.foto_ruta) await borrarFoto(anterior.foto_ruta);
        } else {
            const respuesta = await supabase.from("buses").insert(datos).select(columnas).single();
            if (respuesta.error) throw respuesta.error;
            data = respuesta.data;

            // La foto necesita el id del bus: se sube después de crearlo.
            if (archivo) {
                try {
                    fotoNueva = await subirFoto(data.id, archivo);
                    const conFoto = await supabase
                        .from("buses")
                        .update({ foto_ruta: fotoNueva })
                        .eq("id", data.id)
                        .select(columnas)
                        .single();

                    if (conFoto.error) throw conFoto.error;
                    data = conFoto.data;
                } catch (errorFoto) {
                    console.error("No se pudo guardar la foto:", errorFoto);
                    if (fotoNueva) await borrarFoto(fotoNueva);
                    aviso = " No se pudo subir la foto: edita el bus para intentarlo de nuevo.";
                }
            }
        }

        buses = buses.filter(bus => bus.id !== data.id).concat(data);
        ordenarBuses();
        mostrarBuses();

        mostrarMensaje((idActual ? "Bus actualizado correctamente." : "Bus registrado correctamente.") + aviso,
            aviso ? "warning" : "success");

        guardado = true;
    } catch (error) {
        console.error("Error al guardar el bus:", error);

        // Si la foto nueva se subió pero el bus no se guardó, se borra.
        if (idActual && fotoNueva) await borrarFoto(fotoNueva);

        mostrarErrorFormulario(mensajeErrorBus(error, "guardar"));
        errorFormulario.scrollIntoView({ block: "nearest" });
    } finally {
        cambiarOcupado(false);
    }

    if (guardado) modal.hide();
}

// ---------------------------------------------------------------------
// Crear una plantilla nueva desde el formulario y volver
// ---------------------------------------------------------------------

function irACrearPlantilla() {
    const borrador = {
        busId: busId.value,
        valores: { ...valoresDelFormulario(), plantillaId: "" },
        teniaFoto: Boolean(fotoBus.files?.length)
    };

    try {
        sessionStorage.setItem(BORRADOR, JSON.stringify(borrador));
    } catch (error) {
        console.warn("No se pudo guardar el borrador del bus:", error);
    }

    window.location.href = "../cooperativa/plantilla-asientos.html?nueva=1&volver=bus";
}

/** Al volver del editor: reabre el formulario con lo escrito y la plantilla nueva. */
function reanudarBorrador() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("plantilla") && !params.has("reanudar")) return;

    let borrador = null;
    try {
        borrador = JSON.parse(sessionStorage.getItem(BORRADOR) ?? "null");
        sessionStorage.removeItem(BORRADOR);
    } catch (error) {
        console.warn("No se pudo leer el borrador del bus:", error);
    }

    window.history.replaceState(null, "", window.location.pathname);
    if (!borrador) return;

    if (borrador.busId && buses.some(bus => bus.id === borrador.busId)) {
        abrirEdicion(borrador.busId);
    } else {
        prepararFormulario();
        modal.show();
    }

    const { valores } = borrador;
    const plantilla = params.get("plantilla");

    ["numeroInterno", "placa", "dueno", "chasis", "marcaCarroceriaOtra", "marcaChasisOtra"].forEach(clave => {
        campos[clave].value = valores[clave] ?? "";
    });

    ["grupoId", "marcaCarroceriaId", "marcaChasisId", "usuarioBusId"].forEach(clave => {
        const select = campos[clave];
        if ([...select.options].some(o => o.value === valores[clave])) select.value = valores[clave];
    });

    if (plantilla && listas.plantillas?.some(p => p.id === plantilla)) ponerPlantillas(plantilla);
    mostrarMarcasOtra();

    if (borrador.teniaFoto) {
        mostrarErrorFormulario("");
        errorFoto.textContent = "Vuelve a elegir la foto: no se conserva al salir del formulario.";
        fotoBus.classList.add("is-invalid");
    }
}

// ---------------------------------------------------------------------
// Eventos e inicio
// ---------------------------------------------------------------------

botonNuevo.addEventListener("click", function () {
    if (ocupado || !accesoPermitido || !cooperativaGerente) return;

    prepararFormulario();
    modal.show();
});

prepararCampoPlaca(campos.placa);

Object.values(campos).forEach(campo => {
    campo.addEventListener("input", () => campo.classList.remove("is-invalid"));
    campo.addEventListener("change", () => campo.classList.remove("is-invalid"));
});

campos.marcaCarroceriaId.addEventListener("change", mostrarMarcasOtra);
campos.marcaChasisId.addEventListener("change", mostrarMarcasOtra);

campos.plantillaId.addEventListener("change", function () {
    if (campos.plantillaId.value === CREAR_PLANTILLA) irACrearPlantilla();
});

fotoBus.addEventListener("change", function () {
    const archivo = fotoBus.files?.[0] ?? null;
    const problema = validarFoto(archivo);

    fotoBus.classList.toggle("is-invalid", Boolean(problema));
    errorFoto.textContent = problema;

    if (archivo && !problema) {
        imagenFoto.src = URL.createObjectURL(archivo);
        vistaFoto.classList.remove("d-none");
        $("grupoQuitarFoto").classList.add("d-none");
    }
});

elementoModal.addEventListener("shown.bs.modal", function () {
    campos.numeroInterno.focus();
});

elementoModal.addEventListener("hide.bs.modal", function (evento) {
    if (ocupado) evento.preventDefault();
});

elementoModal.addEventListener("hidden.bs.modal", prepararFormulario);
formulario.addEventListener("submit", guardarBus);

// Crear varios buses a la vez (ver buses-lote.js)
const lote = crearLote({
    supabase,
    columnas,
    botonNuevo,
    obtenerListas: function () {
        return listas;
    },
    obtenerEstado: function () {
        return { ocupado, accesoPermitido, cooperativaGerente, buses };
    },
    cambiarOcupado,
    alGuardar: function (nuevos) {
        buses = buses.concat(nuevos);
        ordenarBuses();
        mostrarBuses();

        mostrarMensaje(`${nuevos.length} buses registrados correctamente.`, "success");
    }
});

async function iniciar() {
    cambiarOcupado(true);
    mostrarEstadoTabla("Comprobando acceso...");

    try {
        // Solo el gerente (rol 'cooperativa'). Sin sesión -> login; otro rol -> sin-acceso.
        const rol = await exigirRoles(["cooperativa"]);

        if (!rol) return; // ya fue redirigido

        accesoPermitido = true;

        cooperativaGerente = await obtenerCooperativaGerente();

        if (!cooperativaGerente) {
            mostrarMensaje(
                "Tu cuenta aún no tiene una cooperativa asignada. Contacta al administrador.",
                "warning"
            );
            mostrarEstadoTabla("Sin cooperativa asignada.");
            return;
        }

        nombreCoop.textContent = cooperativaGerente.nombre;

        await Promise.all([cargarCombos(), cargarBuses()]);
    } catch (error) {
        console.error("Error al cargar buses:", error);

        mostrarMensaje(
            "No se pudieron cargar los datos. Revisa tu conexión y vuelve a intentar.",
            "danger"
        );

        mostrarEstadoTabla("No se pudo cargar el listado de buses.");
    } finally {
        cambiarOcupado(false);
    }

    if (buses.some(bus => bus.numero_interno_provisional || bus.dueno === "Por registrar")) {
        mostrarMensaje(
            "Algunos buses tienen el número interno provisional o el dueño por registrar: edítalos para completarlos.",
            "warning"
        );
    }

    reanudarBorrador();
}

iniciar();

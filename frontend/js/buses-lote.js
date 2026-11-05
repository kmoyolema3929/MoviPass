// frontend/js/buses-lote.js
// Alta de varios buses a la vez, todos del mismo tipo, para el gerente de la cooperativa.
// Se conecta desde buses.js con crearLote(...). No modifica el formulario de un solo bus.

const MAX_LOTE = 30;

const CAMPOS = [
    ["placa", "Placa"],
    ["chasis", "Chasis"],
    ["carroceria", "Carrocería"]
];

const PLANTILLA_MODAL = `
<div class="modal fade" id="modalLote" tabindex="-1" aria-labelledby="tituloModalLote" aria-hidden="true" data-bs-backdrop="static">
    <div class="modal-dialog modal-lg">
        <form class="modal-content" id="formLote" novalidate>
            <div class="modal-header">
                <h2 class="modal-title h5" id="tituloModalLote">Agregar varios buses</h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <fieldset id="contenidoLote" class="border-0 p-0 m-0" style="min-width: 0;">
                <div class="modal-body">
                    <div id="errorLote" class="alert alert-danger d-none" role="alert"></div>

                    <div class="mb-3">
                        <label for="tipoLote" class="form-label">Tipo de bus (el mismo para todo el lote)</label>
                        <select id="tipoLote" class="form-select" required></select>
                        <div class="invalid-feedback">Elige el tipo de bus.</div>
                    </div>

                    <p class="text-muted small mb-2">
                        Escribe una fila por bus. También puedes copiar filas de Excel (placa, chasis y carrocería) y pegarlas en la primera casilla.
                    </p>

                    <div class="table-responsive">
                        <table class="table table-sm align-middle mb-2">
                            <thead>
                                <tr>
                                    <th scope="col">Placa</th>
                                    <th scope="col">Chasis</th>
                                    <th scope="col">Carrocería</th>
                                    <th scope="col"><span class="visually-hidden">Quitar</span></th>
                                </tr>
                            </thead>
                            <tbody id="filasLote"></tbody>
                        </table>
                    </div>

                    <button type="button" id="btnFilaLote" class="btn btn-outline-secondary btn-sm">Agregar fila</button>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" id="btnGuardarLote" class="btn btn-primary">Guardar buses</button>
                </div>
            </fieldset>
        </form>
    </div>
</div>`;

export function crearLote({
    supabase,
    columnas,
    botonNuevo,
    tipoBus,
    obtenerEstado,
    cambiarOcupado,
    obtenerMensajeError,
    alGuardar
}) {
    document.body.insertAdjacentHTML("beforeend", PLANTILLA_MODAL);

    const elementoModal = document.getElementById("modalLote");
    const modal = new bootstrap.Modal(elementoModal);
    const formulario = document.getElementById("formLote");
    const contenido = document.getElementById("contenidoLote");
    const errorLote = document.getElementById("errorLote");
    const tipoLote = document.getElementById("tipoLote");
    const filasLote = document.getElementById("filasLote");
    const botonFila = document.getElementById("btnFilaLote");
    const botonGuardar = document.getElementById("btnGuardarLote");

    // Botón junto a "Nuevo bus": un solo bus o varios
    const botonLote = document.createElement("button");
    botonLote.type = "button";
    botonLote.className = "btn btn-outline-primary";
    botonLote.textContent = "Agregar varios";

    const grupo = document.createElement("div");
    grupo.className = "d-flex flex-wrap gap-2";
    botonNuevo.replaceWith(grupo);
    grupo.append(botonNuevo, botonLote);

    function mostrarError(texto) {
        errorLote.textContent = texto;
        errorLote.classList.remove("d-none");
    }

    function agregarFila(valores = {}) {
        if (filasLote.rows.length >= MAX_LOTE) {
            mostrarError(`Puedes agregar hasta ${MAX_LOTE} buses por lote.`);
            return;
        }

        const fila = document.createElement("tr");

        CAMPOS.forEach(function ([nombre, etiqueta]) {
            const celda = document.createElement("td");
            const campo = document.createElement("input");

            campo.type = "text";
            campo.className = "form-control form-control-sm";
            campo.required = true;
            campo.dataset.campo = nombre;
            campo.setAttribute("aria-label", etiqueta);
            campo.value = valores[nombre] ?? "";

            // Al corregir una placa se limpia el aviso de "repetida"
            if (nombre === "placa") {
                campo.addEventListener("input", function () {
                    campo.setCustomValidity("");
                });
            }

            celda.appendChild(campo);
            fila.appendChild(celda);
        });

        const celdaQuitar = document.createElement("td");
        const botonQuitar = document.createElement("button");

        botonQuitar.type = "button";
        botonQuitar.className = "btn btn-outline-danger btn-sm";
        botonQuitar.textContent = "Quitar";
        botonQuitar.addEventListener("click", function () {
            fila.remove();
            if (filasLote.rows.length === 0) agregarFila();
        });

        celdaQuitar.appendChild(botonQuitar);
        fila.appendChild(celdaQuitar);
        filasLote.appendChild(fila);
    }

    function prepararLote() {
        formulario.reset();
        formulario.classList.remove("was-validated");
        errorLote.classList.add("d-none");

        // Mismas opciones que el formulario de un solo bus
        tipoLote.replaceChildren(
            ...Array.from(tipoBus.options).map(function (opcion) {
                return new Option(opcion.textContent, opcion.value);
            })
        );

        filasLote.replaceChildren();
        for (let i = 0; i < 3; i++) agregarFila();
    }

    // Pegar desde Excel: cada línea es un bus y las columnas vienen separadas por tabulación
    filasLote.addEventListener("paste", function (evento) {
        const texto = evento.clipboardData.getData("text");

        if (!/[\t\n]/.test(texto)) return; // pegado normal de un solo valor

        evento.preventDefault();

        const lineas = texto
            .split(/\r?\n/)
            .filter(function (linea) { return linea.trim() !== ""; })
            .slice(0, MAX_LOTE);

        let indice = Array.from(filasLote.rows).indexOf(evento.target.closest("tr"));

        lineas.forEach(function (linea) {
            const [placa = "", chasis = "", carroceria = ""] = linea.split("\t");

            if (!filasLote.rows[indice]) agregarFila();

            const fila = filasLote.rows[indice];
            if (!fila) return;

            fila.querySelector('[data-campo="placa"]').value = placa.trim();
            fila.querySelector('[data-campo="chasis"]').value = chasis.trim();
            fila.querySelector('[data-campo="carroceria"]').value = carroceria.trim();

            indice++;
        });
    });

    function mensajeDeError(error) {
        if (error?.code === "23505") {
            const coincidencia = /\(placa\)=\(([^)]+)\)/.exec(error.details ?? "");

            return coincidencia
                ? `La placa ${coincidencia[1]} ya está registrada. No se guardó ningún bus del lote.`
                : "Una de las placas ya está registrada. No se guardó ningún bus del lote.";
        }

        return `${obtenerMensajeError(error, "guardar")} No se guardó ningún bus del lote.`;
    }

    async function guardar(evento) {
        evento.preventDefault();

        const estado = obtenerEstado();

        if (estado.ocupado || !estado.accesoPermitido || !estado.cooperativaGerente) return;

        errorLote.classList.add("d-none");

        // Las filas totalmente vacías se ignoran
        Array.from(filasLote.rows).forEach(function (fila) {
            const vacia = Array.from(fila.querySelectorAll("input")).every(function (campo) {
                return campo.value.trim() === "";
            });

            if (vacia) fila.remove();
        });

        if (filasLote.rows.length === 0) {
            agregarFila();
            mostrarError("Agrega al menos un bus.");
            return;
        }

        filasLote.querySelectorAll("input").forEach(function (campo) {
            const limpio = campo.value.trim();

            campo.value = campo.dataset.campo === "placa" ? limpio.toUpperCase() : limpio;
            campo.setCustomValidity("");
        });

        // Placas repetidas dentro del lote o ya registradas en tu cooperativa
        const vistas = new Set();

        filasLote.querySelectorAll('[data-campo="placa"]').forEach(function (campo) {
            const repetida = vistas.has(campo.value) ||
                estado.buses.some(function (bus) { return bus.placa === campo.value; });

            if (repetida) campo.setCustomValidity("Placa repetida.");

            vistas.add(campo.value);
        });

        formulario.classList.add("was-validated");

        if (!formulario.checkValidity()) {
            mostrarError("Revisa las casillas marcadas en rojo: hay campos vacíos o placas repetidas.");
            return;
        }

        const datos = Array.from(filasLote.rows).map(function (fila) {
            return {
                placa: fila.querySelector('[data-campo="placa"]').value,
                chasis: fila.querySelector('[data-campo="chasis"]').value,
                carroceria: fila.querySelector('[data-campo="carroceria"]').value,
                cooperativa_id: estado.cooperativaGerente.id,
                tipo_bus: tipoLote.value
            };
        });

        cambiarOcupado(true);
        contenido.disabled = true;
        botonGuardar.textContent = "Guardando...";

        let guardado = false;

        try {
            // Una sola llamada: si algo falla, no se guarda ningún bus
            const { data, error } = await supabase
                .from("buses")
                .insert(datos)
                .select(columnas);

            if (error) throw error;

            alGuardar(data ?? []);
            guardado = true;
        } catch (error) {
            console.error("Error al guardar el lote de buses:", error);
            mostrarError(mensajeDeError(error));
        } finally {
            cambiarOcupado(false);
            contenido.disabled = false;
            botonGuardar.textContent = "Guardar buses";
        }

        if (guardado) modal.hide();
    }

    botonLote.addEventListener("click", function () {
        const estado = obtenerEstado();

        if (estado.ocupado || !estado.accesoPermitido || !estado.cooperativaGerente) return;

        prepararLote();
        modal.show();
    });

    botonFila.addEventListener("click", function () {
        errorLote.classList.add("d-none");
        agregarFila();
    });

    elementoModal.addEventListener("shown.bs.modal", function () {
        tipoLote.focus();
    });

    elementoModal.addEventListener("hide.bs.modal", function (evento) {
        if (obtenerEstado().ocupado) evento.preventDefault();
    });

    formulario.addEventListener("submit", guardar);

    return {
        // buses.js lo llama desde cambiarOcupado para bloquear el botón
        bloquear(valor) {
            botonLote.disabled = valor;
        }
    };
}

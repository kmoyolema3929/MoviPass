// frontend/js/buses-lote.js
// Alta de varios buses a la vez para el gerente de la cooperativa. Todos los
// buses del lote comparten grupo, plantilla y marcas; cada fila tiene su
// número interno, placa, dueño y número de chasis (cambio 6, parte 3).
// Se conecta desde buses.js con crearLote(...). No modifica el formulario de un solo bus.

import { formatearPlacaPegada, normalizarPlaca, prepararCampoPlaca } from "./validaciones.js";
import { ponerOpciones, vaciarCombo } from "./combos.js";
import { LIMITES_BUS, datosDelBus, esMarcaOtro, mensajeErrorBus, normalizarNumeroInterno, revisarBus } from "./formularioBus.js";

const MAX_LOTE = 30;

// [campo, etiqueta, obligatorio, máximo]
const CAMPOS = [
    ["numeroInterno", "Número interno", true, LIMITES_BUS.numeroInterno],
    ["placa", "Placa", true, 8],
    ["dueno", "Dueño o socio", true, LIMITES_BUS.dueno],
    ["chasis", "Número de chasis", false, LIMITES_BUS.chasis]
];

const PLANTILLA_MODAL = `
<div class="modal fade" id="modalLote" tabindex="-1" aria-labelledby="tituloModalLote" aria-hidden="true" data-bs-backdrop="static">
    <div class="modal-dialog modal-xl">
        <form class="modal-content" id="formLote" novalidate>
            <div class="modal-header">
                <h2 class="modal-title h5" id="tituloModalLote">Agregar varios buses</h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <fieldset id="contenidoLote" class="border-0 p-0 m-0" style="min-width: 0;">
                <div class="modal-body">
                    <div id="errorLote" class="alert alert-danger d-none" role="alert"></div>

                    <p class="text-muted small">* Campo obligatorio. Estos datos son los mismos para todo el lote:</p>

                    <div class="row g-3 mb-3">
                        <div class="col-12 col-md-6 col-lg-3">
                            <label for="grupoLote" class="form-label">Grupo *</label>
                            <select id="grupoLote" class="form-select" required disabled>
                                <option value="" selected disabled>Cargando...</option>
                            </select>
                        </div>
                        <div class="col-12 col-md-6 col-lg-3">
                            <label for="plantillaLote" class="form-label">Plantilla de asientos *</label>
                            <select id="plantillaLote" class="form-select" required disabled>
                                <option value="" selected disabled>Cargando...</option>
                            </select>
                        </div>
                        <div class="col-12 col-md-6 col-lg-3">
                            <label for="marcaCarroceriaLote" class="form-label">Marca de carrocería *</label>
                            <select id="marcaCarroceriaLote" class="form-select" required disabled>
                                <option value="" selected disabled>Cargando...</option>
                            </select>
                            <input type="text" id="marcaCarroceriaOtraLote" class="form-control mt-2 d-none" maxlength="60"
                                   placeholder="¿Cuál marca? *" aria-label="¿Cuál marca de carrocería? *">
                        </div>
                        <div class="col-12 col-md-6 col-lg-3">
                            <label for="marcaChasisLote" class="form-label">Marca de chasis (opcional)</label>
                            <select id="marcaChasisLote" class="form-select" disabled>
                                <option value="" selected>Cargando...</option>
                            </select>
                            <input type="text" id="marcaChasisOtraLote" class="form-control mt-2 d-none" maxlength="60"
                                   placeholder="¿Cuál marca? *" aria-label="¿Cuál marca de chasis? *">
                        </div>
                    </div>

                    <p class="text-muted small mb-2">
                        Escribe una fila por bus. También puedes copiar filas de Excel (número interno, placa, dueño y número de chasis) y pegarlas en la primera casilla.
                    </p>

                    <div class="table-responsive">
                        <table class="table table-sm align-middle mb-2">
                            <thead>
                                <tr>
                                    <th scope="col">Número interno *</th>
                                    <th scope="col">Placa *</th>
                                    <th scope="col">Dueño o socio *</th>
                                    <th scope="col">Número de chasis (opcional)</th>
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
    obtenerListas,
    obtenerEstado,
    cambiarOcupado,
    alGuardar
}) {
    document.body.insertAdjacentHTML("beforeend", PLANTILLA_MODAL);

    const $ = id => document.getElementById(id);
    const elementoModal = $("modalLote");
    const modal = new bootstrap.Modal(elementoModal);
    const formulario = $("formLote");
    const contenido = $("contenidoLote");
    const errorLote = $("errorLote");
    const filasLote = $("filasLote");
    const botonFila = $("btnFilaLote");
    const botonGuardar = $("btnGuardarLote");
    const comunes = {
        grupoId: $("grupoLote"),
        plantillaId: $("plantillaLote"),
        marcaCarroceriaId: $("marcaCarroceriaLote"),
        marcaCarroceriaOtra: $("marcaCarroceriaOtraLote"),
        marcaChasisId: $("marcaChasisLote"),
        marcaChasisOtra: $("marcaChasisOtraLote")
    };

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

    function mostrarMarcasOtra() {
        const listas = obtenerListas();
        comunes.marcaCarroceriaOtra.classList.toggle("d-none", !esMarcaOtro(listas.marcasCarroceria, comunes.marcaCarroceriaId.value));
        comunes.marcaChasisOtra.classList.toggle("d-none", !esMarcaOtro(listas.marcasChasis, comunes.marcaChasisId.value));
    }

    function agregarFila(valores = {}) {
        if (filasLote.rows.length >= MAX_LOTE) {
            mostrarError(`Puedes agregar hasta ${MAX_LOTE} buses por lote.`);
            return;
        }

        const fila = document.createElement("tr");

        CAMPOS.forEach(function ([nombre, etiqueta, obligatorio, maximo]) {
            const celda = document.createElement("td");
            const campo = document.createElement("input");

            campo.type = "text";
            campo.className = "form-control form-control-sm";
            campo.required = obligatorio;
            campo.maxLength = maximo;
            campo.dataset.campo = nombre;
            campo.setAttribute("aria-label", `${etiqueta}${obligatorio ? " *" : " (opcional)"}`);
            campo.value = valores[nombre] ?? "";
            campo.addEventListener("input", () => campo.classList.remove("is-invalid"));

            if (nombre === "placa") prepararCampoPlaca(campo);

            const aviso = document.createElement("div");
            aviso.className = "invalid-feedback";

            celda.append(campo, aviso);
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
        errorLote.classList.add("d-none");

        // Los mismos combos que el formulario de un solo bus.
        const listas = obtenerListas();
        const poner = (select, lista, config) => (lista
            ? ponerOpciones(select, lista, config)
            : vaciarCombo(select, "No se pudo cargar. Recarga la página."));

        poner(comunes.grupoId, listas.grupos, { inicial: "Selecciona un grupo...", vacio: "Primero crea un grupo de bus" });
        poner(comunes.plantillaId, listas.plantillas, { inicial: "Selecciona una plantilla...", vacio: "Primero crea una plantilla" });
        poner(comunes.marcaCarroceriaId, listas.marcasCarroceria, { inicial: "Selecciona una marca..." });
        poner(comunes.marcaChasisId, listas.marcasChasis, { todos: "Sin especificar" });
        mostrarMarcasOtra();

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
            .filter(linea => linea.trim() !== "")
            .slice(0, MAX_LOTE);

        let indice = Array.from(filasLote.rows).indexOf(evento.target.closest("tr"));

        lineas.forEach(function (linea) {
            const [numeroInterno = "", placa = "", dueno = "", chasis = ""] = linea.split("\t");

            if (!filasLote.rows[indice]) agregarFila();

            const fila = filasLote.rows[indice];
            if (!fila) return;

            fila.querySelector('[data-campo="numeroInterno"]').value = numeroInterno.trim();
            fila.querySelector('[data-campo="placa"]').value = formatearPlacaPegada(placa);
            fila.querySelector('[data-campo="dueno"]').value = dueno.trim();
            fila.querySelector('[data-campo="chasis"]').value = chasis.trim();

            indice++;
        });
    });

    function mensajeDeError(error) {
        const detalle = error?.details ?? "";

        if (error?.code === "23505") {
            const placa = /\(placa\)=\(([^)]+)\)/.exec(detalle);
            const numero = /numero_interno.*\)=\([^,]+, ([^)]+)\)/.exec(detalle);

            if (placa) return `La placa ${placa[1]} ya está registrada. No se guardó ningún bus del lote.`;
            if (numero) return `El número interno ${numero[1].toUpperCase()} ya existe. No se guardó ningún bus del lote.`;
        }

        return `${mensajeErrorBus(error, "guardar")} No se guardó ningún bus del lote.`;
    }

    function valoresDeFila(fila, valoresComunes) {
        const valores = { ...valoresComunes };
        fila.querySelectorAll("input").forEach(campo => { valores[campo.dataset.campo] = campo.value; });
        return valores;
    }

    async function guardar(evento) {
        evento.preventDefault();

        const estado = obtenerEstado();
        const listas = obtenerListas();

        if (estado.ocupado || !estado.accesoPermitido || !estado.cooperativaGerente) return;

        errorLote.classList.add("d-none");

        // Las filas totalmente vacías se ignoran
        Array.from(filasLote.rows).forEach(function (fila) {
            const vacia = Array.from(fila.querySelectorAll("input")).every(campo => campo.value.trim() === "");
            if (vacia) fila.remove();
        });

        if (filasLote.rows.length === 0) {
            agregarFila();
            mostrarError("Agrega al menos un bus.");
            return;
        }

        const valoresComunes = Object.fromEntries(Object.entries(comunes).map(([clave, campo]) => [clave, campo.value]));
        const contexto = {
            buses: estado.buses,
            marcasCarroceria: listas.marcasCarroceria ?? [],
            marcasChasis: listas.marcasChasis ?? []
        };

        // Datos comunes: se revisan con la primera fila (son iguales en todas).
        const primera = revisarBus(valoresDeFila(filasLote.rows[0], valoresComunes), contexto);
        const problemasComunes = ["grupoId", "plantillaId", "marcaCarroceriaId", "marcaCarroceriaOtra", "marcaChasisOtra"]
            .filter(clave => primera[clave])
            .map(clave => primera[clave]);

        // Cada fila: número interno, placa, dueño y chasis; sin repetir dentro del lote.
        const vistosNumero = new Set();
        const vistasPlaca = new Set();
        let hayErrores = false;

        Array.from(filasLote.rows).forEach(function (fila) {
            const valores = valoresDeFila(fila, valoresComunes);
            const errores = revisarBus(valores, contexto);
            const numero = normalizarNumeroInterno(valores.numeroInterno);
            const placa = normalizarPlaca(valores.placa);

            if (placa.valida) fila.querySelector('[data-campo="placa"]').value = placa.placa;
            if (numero && vistosNumero.has(numero)) errores.numeroInterno = "Número repetido en el lote.";
            if (placa.valida && vistasPlaca.has(placa.placa)) errores.placa = "Placa repetida en el lote.";

            vistosNumero.add(numero);
            vistasPlaca.add(placa.placa);

            CAMPOS.forEach(function ([nombre]) {
                const campo = fila.querySelector(`[data-campo="${nombre}"]`);
                const problema = errores[nombre] ?? "";

                campo.classList.toggle("is-invalid", Boolean(problema));
                campo.nextElementSibling.textContent = problema;
                if (problema) hayErrores = true;
            });
        });

        if (problemasComunes.length || hayErrores) {
            mostrarError(problemasComunes.length
                ? problemasComunes.join(" ")
                : "Revisa las casillas marcadas en rojo: hay campos vacíos, placas con formato no válido o datos repetidos.");
            return;
        }

        const datos = Array.from(filasLote.rows).map(fila => ({
            ...datosDelBus(valoresDeFila(fila, valoresComunes), contexto),
            cooperativa_id: estado.cooperativaGerente.id
        }));

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

    comunes.marcaCarroceriaId.addEventListener("change", mostrarMarcasOtra);
    comunes.marcaChasisId.addEventListener("change", mostrarMarcasOtra);

    elementoModal.addEventListener("shown.bs.modal", function () {
        comunes.grupoId.focus();
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

// frontend/js/plantillas.js
// Pantalla "Mis plantillas" (cambio 6, parte 2): lista de plantillas con
// nombre y editor visual. La lógica del editor está en editorPlantilla.js.

import { supabase } from './supabaseClient.js';
import { exigirRoles } from './guardas.js';
import { llenarCombo } from './combos.js';
import { obtenerCooperativasPermitidas } from './asientosService.js';
import { TIPOS_ASIENTO, TIPOS_CELDA } from './celdasEspeciales.js';
import {
    HERRAMIENTAS,
    LIMITES,
    aDistribucion,
    agregarCeldaEnFila,
    cambiarCelda,
    cambiarNumero,
    cambiarNumeroPisos,
    crearModeloNuevo,
    desdeDistribucion,
    insertarColumna,
    insertarFila,
    quitarColumna,
    quitarCeldaEnFila,
    quitarFila,
    renumerarTodo,
    resumir,
    textoAsientos,
    validarModelo
} from './editorPlantilla.js';

const $ = id => document.getElementById(id);

const HERRAMIENTA_NUMERO = 'numero';

// ?nueva=1&volver=bus: se llegó desde el formulario del bus («Crear nueva plantilla...»).
const volverABus = new URLSearchParams(window.location.search).get('volver') === 'bus';
const URL_BUSES = '../bus/buses.html';

let rol = null;
let cooperativaId = '';
let plantillas = [];
let buses = [];
let ocupado = false;

// Editor
let editando = null; // { id, actualizado_en } de la plantilla abierta; null = nueva
let modelo = null;
let herramienta = 'normal';
let seleccion = null; // { piso, fila, columna } para cambiar el número
let cambiado = false;

const mensaje = $('mensaje');
const selectCooperativa = $('cooperativa');
const vistaLista = $('vistaLista');
const vistaEditor = $('vistaEditor');
const tabla = $('tablaPlantillas');
const botonNueva = $('btnNuevaPlantilla');
const formulario = $('formPlantilla');
const nombre = $('nombrePlantilla');
const avisoNombre = $('avisoNombre');
const numeroPisos = $('numeroPisos');
const panelNumero = $('panelNumero');
const campoNumero = $('numeroAsiento');
const errorNumero = $('errorNumero');
const botonGuardar = $('btnGuardar');

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

function mostrarMensaje(texto, tipo = 'info') {
    mensaje.textContent = texto;
    mensaje.className = `alert alert-${tipo}`;
}

function ocultarMensaje() {
    mensaje.className = 'alert d-none';
}

function el(etiqueta, clases = '', texto) {
    const nodo = document.createElement(etiqueta);
    if (clases) nodo.className = clases;
    if (texto !== undefined) nodo.textContent = texto;
    return nodo;
}

function boton(texto, clases, accion, etiqueta) {
    const b = el('button', `btn ${clases}`, texto);
    b.type = 'button';
    if (etiqueta) b.setAttribute('aria-label', etiqueta);
    b.addEventListener('click', accion);
    return b;
}

const clave = texto => String(texto ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
const normalizarNombre = texto => String(texto ?? '').trim().replace(/\s+/g, ' ');
const busesDe = plantillaId => buses.filter(b => b.plantilla_id === plantillaId);

function textoError(error, accion) {
    const texto = error?.message ?? '';

    switch (error?.code) {
        case '23505': // nombre repetido
        case '23503': // plantilla en uso
        case '40001': // otra persona la cambió
        case '55006': // boletos vendidos afectados
        case '22023': // distribución no válida
            return texto;
        case '42501':
            return 'Tu cuenta no tiene permiso para gestionar estas plantillas.';
        default:
            return `No se pudo ${accion} la plantilla. Revisa tu conexión e inténtalo de nuevo.`;
    }
}

// ---------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------

function filaEstado(texto) {
    const fila = el('tr');
    const celda = el('td', 'text-center text-muted py-4', texto);
    celda.colSpan = 5;
    fila.appendChild(celda);
    tabla.replaceChildren(fila);
}

function textoPlacas(lista) {
    if (lista.length === 0) return 'Ninguno';
    const placas = lista.slice(0, 5).map(b => b.placa).join(', ');
    return lista.length > 5 ? `${placas} y ${lista.length - 5} más` : placas;
}

function mostrarLista() {
    if (plantillas.length === 0) {
        filaEstado('Aún no tienes plantillas. Pulsa «Nueva plantilla» para crear la primera.');
        return;
    }

    tabla.replaceChildren();

    plantillas.forEach(plantilla => {
        const usados = busesDe(plantilla.id);
        const fila = el('tr');

        fila.append(
            el('td', 'text-break fw-semibold', plantilla.nombre),
            el('td', '', plantilla.numero_pisos === 2 ? '2 pisos' : '1 piso'),
            el('td', '', textoAsientos(plantilla.total_asientos))
        );

        const celdaBuses = el('td', 'small');
        celdaBuses.append(el('span', 'fw-semibold', `${usados.length} `), el('span', 'text-muted', `(${textoPlacas(usados)})`));
        if (usados.length === 0) celdaBuses.replaceChildren(el('span', 'text-muted', 'Ninguno'));
        fila.appendChild(celdaBuses);

        const acciones = el('td', 'text-nowrap');
        const eliminar = boton('Eliminar', 'btn-outline-danger btn-sm ms-2', () => eliminarPlantilla(plantilla),
            `Eliminar la plantilla ${plantilla.nombre}`);

        if (usados.length > 0) {
            eliminar.disabled = true;
            eliminar.title = 'La usa algún bus: asígnale otra plantilla antes de eliminarla.';
        }

        acciones.append(
            boton('Editar', 'btn-outline-primary btn-sm', () => abrirEditor(plantilla), `Editar la plantilla ${plantilla.nombre}`),
            boton('Duplicar', 'btn-outline-secondary btn-sm ms-2', () => abrirEditor(plantilla, { duplicar: true }),
                `Duplicar la plantilla ${plantilla.nombre}`),
            eliminar
        );
        fila.appendChild(acciones);
        tabla.appendChild(fila);
    });
}

async function cargarDatos() {
    if (!cooperativaId) return;

    filaEstado('Cargando plantillas...');
    botonNueva.disabled = true;

    const [rp, rb] = await Promise.all([
        supabase
            .from('plantillas_bus')
            .select('id, nombre, numero_pisos, total_asientos, distribucion, actualizado_en')
            .eq('cooperativa_id', cooperativaId)
            .order('nombre'),
        supabase
            .from('buses')
            .select('id, placa, plantilla_id')
            .eq('cooperativa_id', cooperativaId)
            .order('placa')
    ]);

    if (rp.error) throw rp.error;
    if (rb.error) throw rb.error;

    plantillas = (rp.data ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    buses = rb.data ?? [];

    mostrarLista();
    botonNueva.disabled = false;
}

async function recargar() {
    try {
        await cargarDatos();
    } catch (error) {
        console.error('No se pudieron cargar las plantillas:', error);
        filaEstado('No se pudieron cargar las plantillas.');
        mostrarMensaje('No se pudieron cargar las plantillas. Revisa tu conexión y recarga la página.', 'danger');
    }
}

async function eliminarPlantilla(plantilla) {
    if (ocupado || busesDe(plantilla.id).length > 0) return;
    if (!window.confirm(`¿Deseas eliminar la plantilla «${plantilla.nombre}»? Esta acción no se puede deshacer.`)) return;

    ocupado = true;
    ocultarMensaje();

    try {
        const { error } = await supabase.rpc('eliminar_plantilla', {
            p_cooperativa_id: cooperativaId,
            p_plantilla_id: plantilla.id
        });

        if (error) throw error;

        mostrarMensaje(`Plantilla «${plantilla.nombre}» eliminada.`, 'success');
    } catch (error) {
        console.error('No se pudo eliminar la plantilla:', error);
        mostrarMensaje(textoError(error, 'eliminar'), 'danger');
    } finally {
        ocupado = false;
        await recargar();
    }
}

// ---------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------

function nombreDeCopia(base) {
    for (let n = 1; n < 100; n++) {
        const sufijo = n === 1 ? ' (copia)' : ` (copia ${n})`;
        const candidato = base.slice(0, 60 - sufijo.length) + sufijo;
        if (!plantillas.some(p => clave(p.nombre) === clave(candidato))) return candidato;
    }
    return '';
}

function abrirEditor(plantilla = null, { duplicar = false } = {}) {
    if (ocupado || !cooperativaId) return;

    ocultarMensaje();
    modelo = plantilla ? desdeDistribucion(plantilla.distribucion) : crearModeloNuevo(1);
    editando = plantilla && !duplicar ? { id: plantilla.id, actualizado_en: plantilla.actualizado_en } : null;
    seleccion = null;
    cambiado = Boolean(duplicar);

    $('tituloEditor').textContent = !plantilla
        ? 'Nueva plantilla'
        : duplicar ? `Copia de «${plantilla.nombre}»` : `Editar «${plantilla.nombre}»`;

    nombre.value = !plantilla ? '' : duplicar ? nombreDeCopia(plantilla.nombre) : plantilla.nombre;
    nombre.setCustomValidity('');
    formulario.classList.remove('was-validated');
    numeroPisos.value = String(modelo.pisos.length);

    const usados = editando ? busesDe(editando.id) : [];
    const aviso = $('avisoUso');
    aviso.classList.toggle('d-none', usados.length === 0);
    aviso.textContent = usados.length === 0 ? '' :
        `La usa${usados.length === 1 ? '' : 'n'} ${usados.length === 1 ? '1 bus' : `${usados.length} buses`} ` +
        `(${textoPlacas(usados)}): los cambios se aplican a todos. Si hay boletos vendidos en viajes pendientes, ` +
        'no podrás quitar, mover ni cambiar el número de esos asientos.';

    elegirHerramienta('normal');
    vistaLista.classList.add('d-none');
    vistaEditor.classList.remove('d-none');
    dibujarEditor();
    nombre.focus();
}

function cerrarEditor({ preguntar = true } = {}) {
    if (preguntar && cambiado && !window.confirm('Tienes cambios sin guardar. ¿Deseas salir sin guardarlos?')) return;

    // Cancelar al venir del formulario del bus: vuelve a él con lo que se había escrito.
    if (preguntar && volverABus) {
        cambiado = false;
        window.location.href = `${URL_BUSES}?reanudar=1`;
        return;
    }

    cambiado = false;
    editando = null;
    modelo = null;
    vistaEditor.classList.add('d-none');
    vistaLista.classList.remove('d-none');

    const url = new URL(window.location.href);
    if (url.searchParams.has('plantilla') || url.searchParams.has('bus')) {
        url.searchParams.delete('plantilla');
        url.searchParams.delete('bus');
        window.history.replaceState(null, '', url);
    }
}

function actualizar(nuevo) {
    if (nuevo === modelo) {
        mostrarMensaje(`Límite alcanzado: hasta ${LIMITES.filas} filas y ${LIMITES.columnas} celdas por fila en cada piso, y al menos 1 fila y 1 columna.`, 'warning');
        return;
    }

    ocultarMensaje();
    modelo = nuevo;
    cambiado = true;
    dibujarEditor();
}

// Herramientas -------------------------------------------------------

function muestra(tipo, icono = '') {
    const m = el('span', 'muestra', icono);
    m.dataset.tipo = tipo;
    m.setAttribute('aria-hidden', 'true');
    return m;
}

function crearHerramientas() {
    const contenedor = $('herramientas');
    const opciones = [
        ...HERRAMIENTAS,
        { clave: HERRAMIENTA_NUMERO, nombre: 'Cambiar número', icono: '#' }
    ];

    opciones.forEach(opcion => {
        const id = `herramienta-${opcion.clave}`;
        const radio = el('input', 'btn-check');
        radio.type = 'radio';
        radio.name = 'herramienta';
        radio.id = id;
        radio.value = opcion.clave;
        radio.autocomplete = 'off';
        radio.addEventListener('change', () => elegirHerramienta(opcion.clave));

        const etiqueta = el('label', 'btn btn-outline-secondary btn-sm herramienta');
        etiqueta.htmlFor = id;
        etiqueta.append(muestra(opcion.clave, opcion.icono ?? ''), document.createTextNode(opcion.nombre));

        contenedor.append(radio, etiqueta);
    });

    // Leyenda de colores
    const leyenda = $('leyenda');
    HERRAMIENTAS.forEach(h => {
        const item = el('li');
        item.append(muestra(h.clave, h.icono ?? ''), document.createTextNode(
            h.clave === 'bloqueado' ? `${h.nombre} (conserva su número, no se vende)`
                : h.asiento ? h.nombre : `${h.nombre} (no es asiento)`
        ));
        leyenda.appendChild(item);
    });
}

function elegirHerramienta(claveHerramienta) {
    herramienta = claveHerramienta;
    const radio = $(`herramienta-${claveHerramienta}`);
    if (radio) radio.checked = true;

    seleccion = null;
    panelNumero.classList.add('d-none');
    errorNumero.textContent = '';
    if (modelo) dibujarEditor();
}

// Cuadrícula ------------------------------------------------------------

function textoCelda(celda) {
    if (celda.tipo !== 'asiento') return TIPOS_CELDA[celda.tipo]?.icono ?? '';
    return celda.clase === 'bloqueado' ? `🔒${celda.numero ?? ''}` : String(celda.numero ?? '');
}

function nombreCelda(celda) {
    return celda.tipo === 'asiento'
        ? `Asiento ${celda.numero} (${TIPOS_ASIENTO[celda.clase].nombre.toLowerCase()})`
        : TIPOS_CELDA[celda.tipo].nombre;
}

function alPulsarCelda(piso, fila, columna) {
    if (herramienta === HERRAMIENTA_NUMERO) {
        const celda = modelo.pisos[piso].celdas[fila][columna];

        if (celda.tipo !== 'asiento') {
            seleccion = null;
            panelNumero.classList.remove('d-none');
            errorNumero.textContent = 'Elige un asiento (las demás celdas no llevan número).';
            dibujarEditor();
            return;
        }

        seleccion = { piso, fila, columna };
        errorNumero.textContent = '';
        panelNumero.classList.remove('d-none');
        const lugar = `${modelo.pisos.length > 1 ? `piso ${piso + 1}, ` : ''}fila ${fila + 1}, columna ${columna + 1}`;
        $('etiquetaNumero').textContent = `Número del asiento (${lugar}) *`;
        campoNumero.value = String(celda.numero);
        dibujarEditor();
        campoNumero.focus();
        campoNumero.select();
        return;
    }

    actualizar(cambiarCelda(modelo, piso, fila, columna, herramienta));
}

function aplicarNumero() {
    if (!seleccion) return;

    const { modelo: nuevo, error } = cambiarNumero(modelo, seleccion.piso, seleccion.fila, seleccion.columna, campoNumero.value);

    if (error) {
        errorNumero.textContent = error;
        campoNumero.focus();
        return;
    }

    errorNumero.textContent = '';
    if (nuevo !== modelo) {
        modelo = nuevo;
        cambiado = true;
    }
    dibujarEditor();
}

function dibujarPiso(indicePiso) {
    const celdas = modelo.pisos[indicePiso].celdas;
    const columnas = celdas[0].length;

    const tarjeta = el('section', 'card shadow-sm border-0 mb-3');
    const cuerpo = el('div', 'card-body editor-piso');
    const titulo = modelo.pisos.length > 1
        ? `Piso ${indicePiso + 1}${indicePiso === 0 ? ' (inferior)' : ' (superior)'}`
        : 'Distribución';
    cuerpo.appendChild(el('h3', 'h6', titulo));
    cuerpo.appendChild(el('div', 'editor-frente', 'Frente del bus'));

    const cuadricula = el('div', 'editor-cuadricula');
    cuadricula.style.gridTemplateColumns = `4.6rem repeat(${columnas}, 3rem) 4.6rem`;
    cuadricula.setAttribute('role', 'group');
    cuadricula.setAttribute('aria-label', titulo);

    // Fila de controles de columnas
    cuadricula.appendChild(el('div'));
    for (let c = 0; c < columnas; c++) {
        const grupo = el('div', 'btn-group btn-group-sm');
        grupo.append(
            boton('+', 'btn-outline-secondary editor-control editor-control-columna px-0', () => actualizar(insertarColumna(modelo, indicePiso, c)),
                `Insertar una columna antes de la columna ${c + 1}`),
            boton('−', 'btn-outline-danger editor-control editor-control-columna px-0', () => actualizar(quitarColumna(modelo, indicePiso, c)),
                `Quitar la columna ${c + 1}`)
        );
        cuadricula.appendChild(grupo);
    }
    cuadricula.appendChild(el('div', 'editor-titulo-celdas small text-muted text-center', 'Celdas'));

    celdas.forEach((fila, f) => {
        const controles = el('div', 'btn-group btn-group-sm');
        controles.append(
            boton('+', 'btn-outline-secondary editor-control editor-control-fila', () => actualizar(insertarFila(modelo, indicePiso, f)),
                `Insertar una fila antes de la fila ${f + 1}`),
            boton('−', 'btn-outline-danger editor-control editor-control-fila', () => actualizar(quitarFila(modelo, indicePiso, f)),
                `Quitar la fila ${f + 1}`)
        );
        cuadricula.appendChild(controles);

        fila.forEach((celda, c) => {
            const b = el('button', 'editor-celda', textoCelda(celda));
            b.type = 'button';
            b.dataset.tipo = celda.tipo === 'asiento' ? celda.clase : celda.tipo;
            b.setAttribute('aria-label', `Fila ${f + 1}, columna ${c + 1}: ${nombreCelda(celda)}`);
            b.title = nombreCelda(celda);

            if (seleccion && seleccion.piso === indicePiso && seleccion.fila === f && seleccion.columna === c) {
                b.classList.add('seleccionada');
            }

            b.addEventListener('click', () => alPulsarCelda(indicePiso, f, c));
            cuadricula.appendChild(b);
        });

        // Agregar o quitar una celda al final de ESTA fila (filas de distinto ancho).
        const celdasFila = el('div', 'btn-group btn-group-sm');
        celdasFila.append(
            boton('+', 'btn-outline-primary editor-control editor-control-fila', () => actualizar(agregarCeldaEnFila(modelo, indicePiso, f)),
                `Agregar una celda al final de la fila ${f + 1}`),
            boton('−', 'btn-outline-danger editor-control editor-control-fila', () => actualizar(quitarCeldaEnFila(modelo, indicePiso, f)),
                `Quitar la última celda de la fila ${f + 1}`)
        );
        celdasFila.title = 'Agregar o quitar una celda al final de esta fila';
        cuadricula.appendChild(celdasFila);
    });

    cuerpo.appendChild(cuadricula);

    const pie = el('div', 'd-flex flex-wrap gap-2 justify-content-center mt-3');
    pie.append(
        boton('Agregar fila al final', 'btn-outline-primary btn-sm', () => actualizar(insertarFila(modelo, indicePiso, celdas.length))),
        boton('Agregar columna al final', 'btn-outline-primary btn-sm', () => actualizar(insertarColumna(modelo, indicePiso, columnas)))
    );
    cuerpo.appendChild(pie);

    tarjeta.appendChild(cuerpo);
    return tarjeta;
}

function dibujarVistaPrevia() {
    const contenedor = $('vistaPrevia');
    contenedor.replaceChildren();

    modelo.pisos.forEach((piso, p) => {
        const bloque = el('div', 'vista-piso');
        if (modelo.pisos.length > 1) bloque.appendChild(el('p', 'small text-muted text-center mb-1', `Piso ${p + 1}`));

        const bus = el('div', 'vista-bus');
        const cuadricula = el('div', 'vista-cuadricula');
        cuadricula.style.gridTemplateColumns = `repeat(${piso.celdas[0].length}, 1.9rem)`;

        piso.celdas.forEach(fila => fila.forEach(celda => {
            const c = el('div', 'vista-celda', textoCelda(celda));
            c.dataset.tipo = celda.tipo === 'asiento' ? celda.clase : celda.tipo;
            c.title = nombreCelda(celda);
            cuadricula.appendChild(c);
        }));

        bus.appendChild(cuadricula);
        bloque.appendChild(bus);
        contenedor.appendChild(bloque);
    });

    const r = resumir(modelo);
    const tipos = Object.entries(r.porTipo)
        .filter(([, n]) => n > 0)
        .filter(([tipo]) => tipo !== 'bloqueado')
        .map(([tipo, n]) => `${n} ${tipo === 'normal' ? (n === 1 ? 'normal' : 'normales') : tipo === 'vip' ? 'VIP' : (n === 1 ? 'cama' : 'camas')}`);

    const capacidad = $('resumenCapacidad');
    capacidad.replaceChildren(
        el('strong', '', `Capacidad: ${textoAsientos(r.total)} a la venta`),
        document.createTextNode(
            (modelo.pisos.length > 1 ? ` (piso 1: ${r.porPiso[0]} · piso 2: ${r.porPiso[1]})` : '') +
            (tipos.length ? ` — ${tipos.join(', ')}` : '') +
            (r.bloqueados ? `. Además, ${r.bloqueados === 1 ? '1 asiento bloqueado' : `${r.bloqueados} asientos bloqueados`} (no se venden).` : '.')
        )
    );

    const lista = $('problemas');
    lista.replaceChildren(...validarModelo(modelo).map(texto => el('li', '', texto)));
}

function dibujarEditor() {
    const contenedor = $('pisosEditor');
    contenedor.replaceChildren(...modelo.pisos.map((_, p) => dibujarPiso(p)));
    dibujarVistaPrevia();
}

// Guardar ---------------------------------------------------------------

async function guardar(evento) {
    evento.preventDefault();
    if (ocupado || !modelo) return;

    ocultarMensaje();
    nombre.value = normalizarNombre(nombre.value);

    let problemaNombre = '';
    if (!nombre.value) {
        problemaNombre = 'Escribe el nombre de la plantilla.';
    } else if (nombre.value.length > 60) {
        problemaNombre = 'El nombre admite máximo 60 caracteres.';
    } else if (plantillas.some(p => p.id !== editando?.id && clave(p.nombre) === clave(nombre.value))) {
        problemaNombre = 'Ya tienes una plantilla con ese nombre.';
    }

    nombre.setCustomValidity(problemaNombre);
    avisoNombre.textContent = problemaNombre;
    formulario.classList.add('was-validated');

    const problemas = validarModelo(modelo);

    if (problemaNombre || problemas.length) {
        mostrarMensaje(problemaNombre || `Corrige la distribución antes de guardar: ${problemas[0]}`, 'warning');
        if (problemaNombre) nombre.focus();
        return;
    }

    ocupado = true;
    botonGuardar.disabled = true;
    botonGuardar.textContent = 'Guardando...';

    try {
        const { data, error } = await supabase.rpc('guardar_plantilla', {
            p_cooperativa_id: cooperativaId,
            p_plantilla_id: editando?.id ?? null,
            p_nombre: nombre.value,
            p_distribucion: aDistribucion(modelo),
            p_actualizado_en_esperado: editando?.actualizado_en ?? null
        });

        if (error) throw error;

        const enUso = Number(data?.buses_asignados ?? 0);

        // Desde el formulario del bus: vuelve con la plantilla nueva elegida.
        if (volverABus && data?.id) {
            cambiado = false;
            window.location.href = `${URL_BUSES}?plantilla=${encodeURIComponent(data.id)}`;
            return;
        }

        cerrarEditor({ preguntar: false });
        mostrarMensaje(
            `Plantilla «${data?.nombre ?? nombre.value}» guardada.` +
            (enUso > 0 ? ` La usa${enUso === 1 ? '' : 'n'} ${enUso === 1 ? '1 bus' : `${enUso} buses`}.` : ''),
            'success'
        );
        await recargar();
    } catch (error) {
        console.error('No se pudo guardar la plantilla:', error);
        mostrarMensaje(textoError(error, 'guardar'), 'danger');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
        ocupado = false;
        botonGuardar.disabled = false;
        botonGuardar.textContent = 'Guardar plantilla';
    }
}

// ---------------------------------------------------------------------
// Eventos e inicio
// ---------------------------------------------------------------------

botonNueva.addEventListener('click', () => abrirEditor(null));
$('btnCancelar').addEventListener('click', () => cerrarEditor());
formulario.addEventListener('submit', guardar);
$('btnAplicarNumero').addEventListener('click', aplicarNumero);
nombre.addEventListener('input', () => { cambiado = true; nombre.setCustomValidity(''); });

campoNumero.addEventListener('keydown', evento => {
    if (evento.key === 'Enter') {
        evento.preventDefault();
        aplicarNumero();
    }
});

numeroPisos.addEventListener('change', () => {
    const pisos = Number(numeroPisos.value);

    if (pisos === 1 && modelo.pisos.length === 2 &&
        !window.confirm('Se quitará el piso 2 con todos sus asientos. ¿Deseas continuar?')) {
        numeroPisos.value = '2';
        return;
    }

    actualizar(cambiarNumeroPisos(modelo, pisos));
});

$('btnRenumerar').addEventListener('click', () => {
    const aviso = editando && busesDe(editando.id).length > 0
        ? 'Todos los asientos se numerarán de nuevo en orden (1, 2, 3...). Si hay boletos vendidos en viajes pendientes, no se podrá guardar. ¿Continuar?'
        : 'Todos los asientos se numerarán de nuevo en orden (1, 2, 3...). ¿Continuar?';

    if (window.confirm(aviso)) actualizar(renumerarTodo(modelo));
});

window.addEventListener('beforeunload', evento => {
    if (cambiado) evento.preventDefault();
});

selectCooperativa.addEventListener('change', async () => {
    if (cambiado && !window.confirm('Tienes cambios sin guardar. ¿Deseas cambiar de cooperativa sin guardarlos?')) {
        selectCooperativa.value = cooperativaId;
        return;
    }

    cerrarEditor({ preguntar: false });
    cooperativaId = selectCooperativa.value;
    ocultarMensaje();
    await recargar();
});

/** ?plantilla=<id> o ?bus=<id> (enlace «Asientos» de buses) abre esa plantilla. */
function abrirDesdeEnlace() {
    const params = new URLSearchParams(window.location.search);

    if (params.get('nueva') === '1') {
        abrirEditor(null);
        if (volverABus) {
            mostrarMensaje('Crea la plantilla y pulsa «Guardar plantilla»: volverás al formulario del bus con ella elegida.', 'info');
            $('btnCancelar').textContent = 'Volver al bus';
        }
        return;
    }

    const bus = buses.find(b => b.id === params.get('bus'));
    const id = params.get('plantilla') ?? bus?.plantilla_id;

    if (bus && !bus.plantilla_id) {
        mostrarMensaje(`El bus ${bus.placa} todavía no tiene plantilla. Crea una o edita una existente.`, 'warning');
        return;
    }

    const plantilla = plantillas.find(p => p.id === id);
    if (plantilla) abrirEditor(plantilla);
}

async function alCargarCooperativas() {
    cooperativaId = selectCooperativa.value;
    if (!cooperativaId) {
        mostrarMensaje('Elige una cooperativa para ver sus plantillas.', 'info');
        return;
    }

    ocultarMensaje();
    await recargar();
    abrirDesdeEnlace();
}

async function iniciar() {
    rol = await exigirRoles(['administrador', 'cooperativa']);
    if (!rol) return;

    crearHerramientas();

    const lista = await llenarCombo(selectCooperativa, {
        cargar: () => obtenerCooperativasPermitidas(rol),
        inicial: 'Selecciona una cooperativa...',
        vacio: 'Tu cuenta no tiene cooperativas asignadas',
        error: 'No se pudieron cargar las cooperativas.',
        alReintentar: alCargarCooperativas
    });

    if (!lista) {
        mostrarMensaje('No se pudieron cargar las cooperativas. Pulsa «Reintentar».', 'danger');
        return;
    }

    if (lista.length === 0) {
        mostrarMensaje('Tu cuenta aún no tiene una cooperativa asignada. Contacta al administrador.', 'warning');
        return;
    }

    await alCargarCooperativas();
}

iniciar();

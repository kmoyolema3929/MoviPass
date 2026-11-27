// frontend/pages/frecuencias/frecuencias.js
// Frecuencias aprobadas (cambio 7, parte 7.1): origen y destino del catálogo
// de cantones, grupo de bus, estado, tipo y paradas en el mismo formulario.

import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { obtenerContextoGestion, textoError } from '../../js/contextoUsuario.js';
import { mostrarAlerta } from '../../js/alertas.js';
import { llenarCombo, ponerOpciones, vaciarCombo } from '../../js/combos.js';
import { obtenerCantones, obtenerProvincias } from '../../js/catalogos.js';
import { etiquetaCanton } from '../../js/lugares.js';
import { obtenerGruposBus } from '../../js/gruposBus.js';
import {
    datosFrecuencia,
    moverFrecuencia,
    opcionesParada,
    ordenarParaHojaRuta,
    porCorregir,
    resolverParada,
    revisarFrecuencia,
    textoTipo
} from '../../js/frecuenciasForm.js';
import { contarUsadas, estadoCupo, fechaHoyEcuador, puedeDestacar } from '../../js/destacadas.js';

const COLUMNAS = 10;
const $ = id => document.getElementById(id);

const tbody = $('tablaFrecuencias');
const form = $('formFrecuencia');
const btnNueva = $('btnNueva');
const btnGuardar = $('btnGuardar');
const errorFormulario = $('errorFormulario');
const filasParadas = $('filasParadas');
const modal = bootstrap.Modal.getOrCreateInstance($('modalFrecuencia'));

const campo = {
    id: $('frecuenciaId'),
    cooperativaId: $('cooperativa'),
    provinciaOrigen: $('provinciaOrigen'),
    origenCantonId: $('cantonOrigen'),
    provinciaDestino: $('provinciaDestino'),
    destinoCantonId: $('cantonDestino'),
    hora: $('hora'),
    precio: $('precioBase'),
    resolucion: $('resolucion'),
    grupoId: $('grupo'),
    estado: $('estado'),
    tipo: $('tipo')
};

let rol = null;
let cooperativas = [];
let cupos = new Map(); // cooperativa_id -> { nombre, estado, cupo_destacadas, destacadas_hasta }
let frecuencias = [];
let provincias = null;
let cantones = null;
let lugares = [];
let ocupado = false;

/* ---------- Utilidades ---------- */

function filaInformativa(texto, clase = 'text-muted') {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = COLUMNAS;
    td.className = `text-center py-3 ${clase}`;
    td.textContent = texto;
    tr.appendChild(td);
    tbody.replaceChildren(tr);
}

function celda(texto, clase = '') {
    const td = document.createElement('td');
    td.className = clase;
    td.textContent = texto;
    return td;
}

function boton(texto, clase, accion, etiqueta) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn btn-sm ${clase}`;
    b.textContent = texto;
    if (etiqueta) b.setAttribute('aria-label', etiqueta);
    b.addEventListener('click', accion);
    return b;
}

function insignia(texto, clase) {
    const span = document.createElement('span');
    span.className = `badge ${clase}`;
    span.textContent = texto;
    return span;
}

const hora = valor => String(valor ?? '').slice(0, 5);
const ruta = f => `${f.origen} → ${f.destino}`;

function mensajeError(error) {
    // Los mensajes de las funciones de la base ya están en español.
    if (['23502', '23503', '23514', '40001', '42501'].includes(error?.code) && error.message) return error.message;
    return textoError(error);
}

/* ---------- Listado ---------- */

async function cargarFrecuencias() {
    let consulta = supabase
        .from('frecuencias')
        .select(`id, origen, destino, origen_canton_id, destino_canton_id, hora, tipo, activa, destacada, precio_base,
                 numero_resolucion, cooperativa_id, grupo_id, orden_hoja_ruta,
                 cooperativas ( nombre ), grupos_bus ( nombre ),
                 paradas ( id, canton_id, nombre, hora_estimada, orden )`);

    // El gerente y el oficinista solo ven las de su cooperativa; el administrador ve todas.
    if (rol !== 'administrador') consulta = consulta.in('cooperativa_id', cooperativas.map(c => c.id));

    const { data, error } = await consulta;
    if (error) throw error;

    frecuencias = data ?? [];
    dibujarTabla();
}

/* ---------- Frecuencias destacadas (cambio 5) ---------- */

/** Cupo y vigencia de las cooperativas del gerente u oficinista (el administrador no los necesita aquí). */
async function cargarCupos() {
    if (rol === 'administrador') return;

    const { data, error } = await supabase
        .from('cooperativas')
        .select('id, nombre, estado, cupo_destacadas, destacadas_hasta')
        .in('id', cooperativas.map(c => c.id));

    if (error) throw error;
    cupos = new Map((data ?? []).map(c => [c.id, c]));
}

function estadoDe(cooperativaId) {
    return estadoCupo(cupos.get(cooperativaId), contarUsadas(frecuencias, cooperativaId), fechaHoyEcuador());
}

/** Contador "Destacadas: 2 de 3" con su aviso, uno por cooperativa. */
function dibujarPanelDestacadas() {
    const panel = $('panelDestacadas');
    panel.replaceChildren();
    panel.classList.toggle('d-none', rol === 'administrador' || cupos.size === 0);
    if (rol === 'administrador') return;

    cupos.forEach((cooperativa, id) => {
        const estado = estadoDe(id);
        const caja = document.createElement('div');
        caja.className = `alert ${estado.aviso ? 'alert-warning' : 'alert-light border'} py-2 mb-2`;

        const titulo = document.createElement('strong');
        titulo.textContent = `★ ${estado.texto}`;
        caja.appendChild(titulo);
        if (cupos.size > 1) caja.append(` · ${cooperativa.nombre}`);
        caja.append(` · ${estado.vigencia}`);

        const notas = [estado.aviso];
        if (rol === 'oficinista') notas.push('Solo el gerente puede marcar o desmarcar las frecuencias destacadas.');
        notas.filter(Boolean).forEach(texto => {
            caja.appendChild(Object.assign(document.createElement('div'), { className: 'small mt-1', textContent: texto }));
        });

        panel.appendChild(caja);
    });
}

function celdaDestacada(f) {
    const td = celda('', 'text-center');
    const permiso = puedeDestacar({
        rol,
        frecuencia: f,
        cooperativa: cupos.get(f.cooperativa_id),
        usadas: contarUsadas(frecuencias, f.cooperativa_id),
        hoy: fechaHoyEcuador()
    });

    const etiqueta = `${f.destacada ? 'Quitar de destacadas' : 'Destacar'}: ${ruta(f)} ${hora(f.hora)}`;
    const estrella = boton(f.destacada ? '★' : '☆', f.destacada ? 'btn-warning' : 'btn-outline-warning',
        () => void cambiarDestacada(f), etiqueta);
    estrella.setAttribute('aria-pressed', String(Boolean(f.destacada)));
    estrella.disabled = !permiso.permitido;

    // Un botón deshabilitado no muestra su title: el motivo va en el contenedor.
    const contenedor = document.createElement('span');
    contenedor.className = 'd-inline-block';
    contenedor.tabIndex = permiso.permitido ? -1 : 0;
    contenedor.title = permiso.permitido ? etiqueta : permiso.motivo;
    if (!permiso.permitido) contenedor.setAttribute('aria-label', `${f.destacada ? 'Destacada' : 'No destacada'}. ${permiso.motivo}`);
    contenedor.appendChild(estrella);
    td.appendChild(contenedor);
    return td;
}

async function cambiarDestacada(f) {
    if (ocupado) return;
    ocupado = true;

    try {
        const { data, error } = await supabase.rpc('marcar_frecuencia_destacada', {
            p_frecuencia_id: f.id,
            p_destacada: !f.destacada
        });
        if (error) throw error;

        const resultado = Array.isArray(data) ? data[0] : data;
        if (resultado && cupos.has(f.cooperativa_id)) {
            cupos.get(f.cooperativa_id).cupo_destacadas = resultado.cupo;
        }

        await cargarFrecuencias();
        const contador = resultado ? ` (Destacadas: ${resultado.usadas} de ${resultado.cupo})` : '';
        mostrarAlerta(`${f.destacada ? 'La frecuencia ya no está destacada' : 'Frecuencia destacada'}${contador}.`, 'success');
    } catch (error) {
        console.error('No se pudo cambiar la frecuencia destacada:', error);
        mostrarAlerta(mensajeError(error), 'danger');
        // El cupo o la vigencia pudieron cambiar: se vuelven a leer.
        try { await cargarCupos(); await cargarFrecuencias(); } catch { /* ya se mostró el error */ }
    } finally {
        ocupado = false;
    }
}

/** Por cooperativa, por grupo (los sin grupo al final) y en el orden de la hoja de ruta. */
function frecuenciasOrdenadas() {
    const grupos = new Map();

    frecuencias.forEach(f => {
        const clave = `${f.cooperativa_id}|${f.grupo_id ?? ''}`;
        if (!grupos.has(clave)) grupos.set(clave, []);
        grupos.get(clave).push(f);
    });

    const nombre = lista => `${lista[0].cooperativas?.nombre ?? ''} ${lista[0].grupos_bus?.nombre ?? ''}`;

    return [...grupos.values()]
        .sort((a, b) => (!a[0].grupo_id - !b[0].grupo_id) || nombre(a).localeCompare(nombre(b), 'es'))
        .flatMap(ordenarParaHojaRuta);
}

function dibujarTabla() {
    dibujarPanelDestacadas();

    if (frecuencias.length === 0) {
        filaInformativa('No hay frecuencias registradas. Pulsa «+ Nueva frecuencia».');
        return;
    }

    tbody.replaceChildren();
    const ordenadas = frecuenciasOrdenadas();
    let pendientes = 0;

    ordenadas.forEach(f => {
        const tr = document.createElement('tr');
        if (!f.activa) tr.className = 'table-secondary';

        const delGrupo = ordenadas.filter(x => x.grupo_id && x.grupo_id === f.grupo_id);
        const posicion = delGrupo.indexOf(f);

        const tdOrden = celda('', 'text-nowrap');
        if (f.grupo_id) {
            const subir = boton('↑', 'btn-outline-secondary px-2', () => void mover(f, -1), `Subir ${ruta(f)} ${hora(f.hora)}`);
            const bajar = boton('↓', 'btn-outline-secondary px-2 ms-1', () => void mover(f, 1), `Bajar ${ruta(f)} ${hora(f.hora)}`);
            subir.disabled = posicion === 0;
            bajar.disabled = posicion === delGrupo.length - 1;
            tdOrden.append(document.createTextNode(`${posicion + 1} `), subir, bajar);
        }

        const tdGrupo = celda(f.grupos_bus?.nombre ?? '');
        if (rol === 'administrador') tdGrupo.prepend(document.createTextNode(`${f.cooperativas?.nombre ?? ''} · `));

        const tdRuta = celda(ruta(f));
        const falta = porCorregir(f);
        if (falta.length) {
            pendientes++;
            const aviso = insignia('por corregir', 'text-bg-warning ms-1');
            aviso.title = `Falta: ${falta.join(', ')}. Edita la frecuencia para completarla.`;
            tdRuta.appendChild(aviso);
        }
        if (f.tipo === 'compartida' && f.paradas?.length) {
            const paradas = [...f.paradas].sort((a, b) => a.orden - b.orden).map(p => p.nombre).join(', ');
            tdRuta.appendChild(Object.assign(document.createElement('div'), { className: 'small text-muted', textContent: `Paradas: ${paradas}` }));
        }

        const tdEstado = celda('');
        tdEstado.appendChild(insignia(f.activa ? 'Activa' : 'Inactiva', f.activa ? 'bg-success' : 'bg-secondary'));

        const tdAcciones = celda('', 'text-center text-nowrap');
        tdAcciones.append(
            boton('Editar', 'btn-outline-primary me-1', () => void abrirEditar(f.id)),
            boton(f.activa ? 'Desactivar' : 'Activar', 'btn-outline-warning me-1', () => void cambiarEstado(f)),
            boton('Eliminar', 'btn-outline-danger', () => void eliminar(f))
        );

        tr.append(
            tdOrden,
            tdGrupo,
            tdRuta,
            celda(hora(f.hora)),
            celda(textoTipo(f.tipo)),
            celda(f.numero_resolucion ?? '—'),
            celda('$' + Number(f.precio_base).toFixed(2)),
            tdEstado,
            celdaDestacada(f),
            tdAcciones
        );
        tbody.appendChild(tr);
    });

    // Aviso fijo (no desaparece) mientras haya frecuencias por corregir.
    const aviso = $('avisoCorregir');
    aviso.classList.toggle('d-none', pendientes === 0);
    aviso.textContent = pendientes === 0 ? '' :
        `${pendientes === 1 ? 'Una frecuencia está' : `${pendientes} frecuencias están`} «por corregir»: ` +
        'no se pudo enlazar su origen o destino con un cantón, o no tiene grupo de bus. ' +
        'Siguen funcionando, pero edítalas para completarlas.';
}

async function mover(f, direccion) {
    if (ocupado) return;

    const ids = moverFrecuencia(frecuencias, f.id, direccion);
    if (!ids) return;

    ocupado = true;
    try {
        const { error } = await supabase.rpc('ordenar_frecuencias', { p_grupo_id: f.grupo_id, p_ids: ids });
        if (error) throw error;
        await cargarFrecuencias();
    } catch (error) {
        console.error('No se pudo cambiar el orden:', error);
        mostrarAlerta(mensajeError(error), 'danger');
    } finally {
        ocupado = false;
    }
}

/* ---------- Combos ---------- */

function ponerCantones(selectProvincia, selectCanton, cantonId = '') {
    const provincia = selectProvincia.value;

    if (!provincia || !cantones) {
        vaciarCombo(selectCanton, 'Primero elige la provincia');
        return;
    }

    ponerOpciones(selectCanton, cantones.filter(c => String(c.provincia_id) === String(provincia)), {
        inicial: 'Selecciona un cantón...',
        texto: etiquetaCanton,
        porDefecto: cantonId
    });
}

function ponerLugar(selectProvincia, selectCanton, cantonId) {
    const canton = cantones?.find(c => c.id === cantonId);

    ponerOpciones(selectProvincia, provincias ?? [], {
        inicial: 'Selecciona una provincia...',
        porDefecto: canton?.provincia_id ?? '',
        unica: false
    });
    ponerCantones(selectProvincia, selectCanton, canton?.id ?? '');
}

async function ponerGrupos(seleccionado = '') {
    const cooperativaId = campo.cooperativaId.value;

    if (!cooperativaId) {
        vaciarCombo(campo.grupoId, 'Primero elige la cooperativa');
        return;
    }

    await llenarCombo(campo.grupoId, {
        cargar: () => obtenerGruposBus(cooperativaId),
        inicial: 'Selecciona un grupo...',
        porDefecto: seleccionado,
        vacio: 'Primero crea un grupo de bus',
        error: 'No se pudieron cargar los grupos.'
    });
}

async function cargarCatalogos() {
    if (provincias && cantones) return;

    [provincias, cantones] = await Promise.all([obtenerProvincias(), obtenerCantones()]);
    lugares = opcionesParada(cantones);

    $('listaLugares').replaceChildren(...lugares.map(o => Object.assign(document.createElement('option'), { value: o.texto })));
}

/* ---------- Paradas ---------- */

function textoParada(parada) {
    if (!parada.canton_id) return parada.nombre ?? '';
    return lugares.find(o => o.canton_id === parada.canton_id)?.texto ?? parada.nombre ?? '';
}

function agregarParada(parada = {}) {
    const fila = document.createElement('tr');

    const lugar = document.createElement('input');
    lugar.type = 'text';
    lugar.className = 'form-control form-control-sm';
    lugar.setAttribute('list', 'listaLugares');
    lugar.maxLength = 100;
    lugar.placeholder = 'Cantón o lugar';
    lugar.dataset.campo = 'lugar';
    lugar.value = textoParada(parada);
    lugar.setAttribute('aria-label', 'Lugar de la parada *');

    const horaParada = document.createElement('input');
    horaParada.type = 'time';
    horaParada.className = 'form-control form-control-sm';
    horaParada.dataset.campo = 'hora';
    horaParada.value = hora(parada.hora_estimada);
    horaParada.setAttribute('aria-label', 'Hora estimada de la parada *');

    const avisoLugar = Object.assign(document.createElement('div'), { className: 'invalid-feedback' });
    const avisoHora = Object.assign(document.createElement('div'), { className: 'invalid-feedback' });

    [lugar, horaParada].forEach(c => c.addEventListener('input', () => c.classList.remove('is-invalid')));

    const tdLugar = document.createElement('td');
    tdLugar.append(lugar, avisoLugar);
    const tdHora = document.createElement('td');
    tdHora.append(horaParada, avisoHora);

    const tdAcciones = celda('', 'text-nowrap');
    tdAcciones.append(
        boton('↑', 'btn-outline-secondary px-2', () => { fila.previousElementSibling?.before(fila); numerarParadas(); }, 'Subir la parada'),
        boton('↓', 'btn-outline-secondary px-2 ms-1', () => { fila.nextElementSibling?.after(fila); numerarParadas(); }, 'Bajar la parada'),
        boton('Quitar', 'btn-outline-danger ms-1', () => { fila.remove(); numerarParadas(); })
    );

    fila.append(celda(''), tdLugar, tdHora, tdAcciones);
    filasParadas.appendChild(fila);
    numerarParadas();
}

function numerarParadas() {
    [...filasParadas.rows].forEach((fila, i) => { fila.cells[0].textContent = String(i + 1); });
}

function leerParadas() {
    return [...filasParadas.rows].map(fila => ({
        ...resolverParada(fila.querySelector('[data-campo="lugar"]').value, lugares),
        hora_estimada: fila.querySelector('[data-campo="hora"]').value
    }));
}

function mostrarSeccionParadas() {
    const conParadas = campo.tipo.value === 'compartida';
    $('seccionParadas').classList.toggle('d-none', !conParadas);
    if (conParadas && filasParadas.rows.length === 0) agregarParada();
}

/* ---------- Formulario ---------- */

function limpiarErrores() {
    errorFormulario.classList.add('d-none');
    $('errorParadas').textContent = '';
    form.querySelectorAll('.is-invalid').forEach(c => c.classList.remove('is-invalid'));
}

function mostrarErrores(errores) {
    let primero = null;

    Object.entries(errores).forEach(([clave, texto]) => {
        const control = campo[clave];
        if (!control || typeof texto !== 'string') return;
        control.classList.add('is-invalid');
        const aviso = form.querySelector(`[data-error="${clave}"]`);
        if (aviso) aviso.textContent = texto;
        primero ??= control;
    });

    $('errorParadas').textContent = errores.paradasGeneral ?? '';

    (errores.paradas ?? []).forEach((problema, i) => {
        const fila = filasParadas.rows[i];
        [['lugar', problema.lugar], ['hora', problema.hora]].forEach(([nombre, texto]) => {
            const control = fila.querySelector(`[data-campo="${nombre}"]`);
            control.classList.toggle('is-invalid', Boolean(texto));
            control.nextElementSibling.textContent = texto ?? '';
            if (texto) primero ??= control;
        });
    });

    primero?.focus();
}

async function prepararFormulario(f = null) {
    form.reset();
    limpiarErrores();
    filasParadas.replaceChildren();
    campo.id.value = f?.id ?? '';

    await cargarCatalogos();

    ponerOpciones(campo.cooperativaId, cooperativas, {
        inicial: 'Selecciona una cooperativa...',
        porDefecto: f?.cooperativa_id ?? '',
        vacio: 'Sin cooperativas disponibles'
    });
    // El gerente no elige la cooperativa: sale de su sesión.
    $('grupoCooperativa').classList.toggle('d-none', cooperativas.length === 1);
    campo.cooperativaId.disabled = Boolean(f) || cooperativas.length === 1;

    ponerLugar(campo.provinciaOrigen, campo.origenCantonId, f?.origen_canton_id);
    ponerLugar(campo.provinciaDestino, campo.destinoCantonId, f?.destino_canton_id);

    campo.hora.value = f ? hora(f.hora) : '';
    campo.precio.value = f ? f.precio_base : '';
    campo.resolucion.value = f?.numero_resolucion ?? '';
    campo.estado.value = f ? String(f.activa) : 'true';
    campo.tipo.value = f?.tipo ?? 'directa';

    [...(f?.paradas ?? [])].sort((a, b) => a.orden - b.orden).forEach(agregarParada);
    mostrarSeccionParadas();

    await ponerGrupos(f?.grupo_id ?? '');
}

async function abrirCrear() {
    $('modalFrecuenciaLabel').textContent = 'Nueva frecuencia';
    modal.show();
    await prepararFormulario(null);
}

async function abrirEditar(id) {
    const f = frecuencias.find(x => x.id === id);
    if (!f) return;

    $('modalFrecuenciaLabel').textContent = `Editar ${ruta(f)} ${hora(f.hora)}`;
    modal.show();
    await prepararFormulario(f);

    const falta = porCorregir(f);
    if (falta.length) {
        errorFormulario.textContent = `Esta frecuencia está por corregir. Falta: ${falta.join(', ')}.` +
            (f.origen_canton_id && f.destino_canton_id ? '' : ` Antes decía «${ruta(f)}».`);
        errorFormulario.className = 'alert alert-warning';
    }
}

form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (ocupado) return;

    limpiarErrores();

    const valores = Object.fromEntries(Object.entries(campo).map(([clave, control]) => [clave, control.value]));
    valores.activa = campo.estado.value;
    const paradas = campo.tipo.value === 'compartida' ? leerParadas() : [];
    const errores = revisarFrecuencia(valores, paradas);

    if (Object.keys(errores).length) {
        mostrarErrores(errores);
        return;
    }

    ocupado = true;
    const textoOriginal = btnGuardar.textContent;
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando...';

    try {
        const { error } = await supabase.rpc('guardar_frecuencia', {
            p_cooperativa_id: valores.cooperativaId,
            p_frecuencia_id: valores.id ? Number(valores.id) : null,
            p_datos: datosFrecuencia(valores),
            p_paradas: paradas
        });

        if (error) throw error;

        modal.hide();
        await cargarFrecuencias();
        mostrarAlerta(
            valores.id ? 'Frecuencia actualizada.' : 'Frecuencia creada. Sus buses se asignan en la hoja de ruta del grupo.',
            'success'
        );
    } catch (error) {
        console.error('Error al guardar la frecuencia:', error);
        errorFormulario.className = 'alert alert-danger';
        errorFormulario.textContent = mensajeError(error);
    } finally {
        ocupado = false;
        btnGuardar.disabled = false;
        btnGuardar.textContent = textoOriginal;
    }
});

campo.provinciaOrigen.addEventListener('change', () => ponerCantones(campo.provinciaOrigen, campo.origenCantonId));
campo.provinciaDestino.addEventListener('change', () => ponerCantones(campo.provinciaDestino, campo.destinoCantonId));
campo.cooperativaId.addEventListener('change', () => void ponerGrupos());
campo.tipo.addEventListener('change', mostrarSeccionParadas);
$('btnAgregarParada').addEventListener('click', () => agregarParada());
Object.values(campo).forEach(control => control.addEventListener('change', () => control.classList.remove('is-invalid')));

/* ---------- Activar / desactivar y eliminar ---------- */

async function cambiarEstado(f) {
    if (ocupado) return;
    ocupado = true;

    try {
        const { error } = await supabase.from('frecuencias').update({ activa: !f.activa }).eq('id', f.id);
        if (error) throw error;

        await cargarFrecuencias();
        // La base quita el destacado al desactivar (trigger frecuencias_destacada).
        mostrarAlerta(
            f.activa
                ? (f.destacada ? 'Frecuencia desactivada. También dejó de estar destacada.' : 'Frecuencia desactivada.')
                : 'Frecuencia activada.',
            'success'
        );
    } catch (error) {
        mostrarAlerta(mensajeError(error), 'danger');
    } finally {
        ocupado = false;
    }
}

async function eliminar(f) {
    if (ocupado) return;
    if (!confirm(`¿Eliminar la frecuencia ${ruta(f)} de las ${hora(f.hora)}?`)) return;

    ocupado = true;

    try {
        const { error } = await supabase.rpc('eliminar_frecuencia', { p_frecuencia_id: f.id });
        if (error) throw error;

        await cargarFrecuencias();
        mostrarAlerta('Frecuencia eliminada.', 'success');
    } catch (error) {
        // Con boletos vendidos la base dice cuántos y sugiere desactivarla.
        mostrarAlerta(mensajeError(error), 'danger');
    } finally {
        ocupado = false;
    }
}

/* ---------- Inicio ---------- */

btnNueva.addEventListener('click', () => void abrirCrear());

async function iniciar() {
    // Cambio 4: el oficinista gestiona las frecuencias de su cooperativa igual que el gerente.
    rol = await exigirRoles(['administrador', 'cooperativa', 'oficinista']);
    if (!rol) return;

    $('btnVolver').href = `../${rol}/index.html`;
    $('marca').href = `../${rol}/index.html`;
    if (rol === 'oficinista') $('marca').textContent = 'MoviPass - Oficinista';

    try {
        const contexto = await obtenerContextoGestion();
        cooperativas = contexto.cooperativas;

        if (rol !== 'administrador' && cooperativas.length === 0) {
            filaInformativa('Tu cuenta aún no está asignada a una cooperativa. Contacta al administrador.', 'text-danger');
            return;
        }

        btnNueva.disabled = false;
        await cargarCupos();
        await cargarFrecuencias();
    } catch (error) {
        console.error('Error al cargar las frecuencias:', error);
        filaInformativa('No se pudieron cargar las frecuencias.', 'text-danger');
        mostrarAlerta(textoError(error), 'danger');
    }
}

iniciar();

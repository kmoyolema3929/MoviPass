// frontend/js/publicidad.js
// Página "Publicidad" del administrador (cambio 5):
//  - Frecuencias destacadas: cupo y vigencia de cada cooperativa.
//  - Banners del carrusel de la portada (tabla publicidad_banners y bucket "publicidad").
// Las reglas también están en la base: aquí solo se avisa antes.

import { supabase } from './supabaseClient.js';
import { exigirRoles } from './guardas.js';
import { mostrarAlerta } from './alertas.js';
import { mensajeErrorBase } from './erroresBase.js';
import {
    IMAGEN_BANNER,
    avisoMedidas,
    datosBanner,
    estadoBanner,
    estadoCupo,
    fechaCorta,
    fechaHoyEcuador,
    moverBanner,
    revisarBanner,
    revisarCupo,
    rutaDesdeUrl,
    rutaImagen,
    validarImagen
} from './destacadas.js';

const $ = id => document.getElementById(id);

const tablaCupos = $('tablaCupos');
const tablaBanners = $('tablaBanners');
const form = $('formBanner');
const errorBanner = $('errorBanner');
const btnGuardar = $('btnGuardarBanner');
const vistaPrevia = $('vistaPrevia');
const modal = bootstrap.Modal.getOrCreateInstance($('modalBanner'));

const campo = {
    id: $('bannerId'),
    titulo: $('titulo'),
    imagen: $('imagen'),
    enlace: $('enlace'),
    cooperativaId: $('anunciante'),
    orden: $('orden'),
    activo: $('activo'),
    fechaInicio: $('fechaInicio'),
    fechaFin: $('fechaFin')
};

let cooperativas = [];
let banners = [];
let ocupado = false;
let urlVistaPrevia = '';

/* ---------- Utilidades ---------- */

function el(etiqueta, clase = '', texto) {
    const e = document.createElement(etiqueta);
    if (clase) e.className = clase;
    if (texto !== undefined) e.textContent = texto;
    return e;
}

function boton(texto, clase, accion, etiqueta) {
    const b = el('button', `btn btn-sm ${clase}`, texto);
    b.type = 'button';
    if (etiqueta) b.setAttribute('aria-label', etiqueta);
    b.addEventListener('click', accion);
    return b;
}

function filaInformativa(tbody, texto, clase = 'text-muted') {
    const td = el('td', `text-center py-3 ${clase}`, texto);
    td.colSpan = 7;
    const tr = el('tr');
    tr.appendChild(td);
    tbody.replaceChildren(tr);
}

const error = (e, accion) => mensajeErrorBase(e, accion);

/* ---------- Pestaña 1: frecuencias destacadas ---------- */

async function cargarCupos() {
    const [coops, destacadas] = await Promise.all([
        supabase.from('cooperativas')
            .select('id, nombre, estado, cupo_destacadas, destacadas_hasta')
            .order('nombre', { ascending: true }),
        supabase.from('frecuencias').select('cooperativa_id').eq('destacada', true)
    ]);
    if (coops.error) throw coops.error;
    if (destacadas.error) throw destacadas.error;

    const usadas = new Map();
    (destacadas.data ?? []).forEach(f => usadas.set(f.cooperativa_id, (usadas.get(f.cooperativa_id) ?? 0) + 1));

    cooperativas = (coops.data ?? []).map(c => ({ ...c, usadas: usadas.get(c.id) ?? 0 }));
    dibujarCupos();
}

function dibujarCupos() {
    if (cooperativas.length === 0) {
        filaInformativa(tablaCupos, 'No hay cooperativas registradas.');
        return;
    }

    const hoy = fechaHoyEcuador();
    tablaCupos.replaceChildren(...cooperativas.map(c => {
        const tr = el('tr');
        const estado = estadoCupo(c, c.usadas, hoy);

        const tdEstado = el('td');
        tdEstado.appendChild(el('span', `badge ${c.estado === 'activa' ? 'bg-success' : 'bg-danger'}`,
            c.estado === 'activa' ? 'Activa' : 'Suspendida'));

        const cupo = el('input', 'form-control form-control-sm campo-cupo');
        Object.assign(cupo, { type: 'number', min: 0, max: 999, step: 1, value: c.cupo_destacadas, required: true });
        cupo.setAttribute('aria-label', `Cupo de destacadas de ${c.nombre} *`);
        const errorCupo = el('div', 'invalid-feedback');
        const tdCupo = el('td');
        tdCupo.append(cupo, errorCupo);

        const hasta = el('input', 'form-control form-control-sm campo-vigencia');
        Object.assign(hasta, { type: 'date', value: c.destacadas_hasta ?? '' });
        hasta.setAttribute('aria-label', `Vigente hasta (opcional) de ${c.nombre}`);
        const errorHasta = el('div', 'invalid-feedback');
        const tdHasta = el('td');
        tdHasta.append(hasta, errorHasta);

        let situacion = 'Vigente';
        let claseSituacion = 'bg-success';
        if (c.estado !== 'activa') { situacion = 'Suspendida: no sale en la portada'; claseSituacion = 'bg-danger'; }
        else if (estado.cupo === 0) { situacion = 'Sin cupo'; claseSituacion = 'bg-secondary'; }
        else if (estado.vencida) { situacion = 'Vencida'; claseSituacion = 'bg-warning text-dark'; }
        else if (estado.lleno) { situacion = 'Cupo lleno'; claseSituacion = 'bg-info text-dark'; }
        const tdSituacion = el('td');
        tdSituacion.appendChild(el('span', `badge ${claseSituacion}`, situacion));

        const limpiar = () => [cupo, hasta].forEach(x => x.classList.remove('is-invalid'));
        [cupo, hasta].forEach(x => x.addEventListener('input', limpiar));

        const guardar = boton('Guardar', 'btn-outline-primary', () => void guardarCupo(c, { cupo, hasta, errorCupo, errorHasta, guardar }),
            `Guardar cupo y vigencia de ${c.nombre}`);
        const tdAcciones = el('td', 'text-center');
        tdAcciones.appendChild(guardar);

        tr.append(el('td', 'text-break', c.nombre), tdEstado, tdCupo, el('td', '', String(c.usadas)), tdHasta, tdSituacion, tdAcciones);
        return tr;
    }));
}

async function guardarCupo(c, ui) {
    if (ocupado) return;

    const errores = revisarCupo({ cupo: ui.cupo.value, hasta: ui.hasta.value }, c.usadas);
    ui.cupo.classList.toggle('is-invalid', Boolean(errores.cupo));
    ui.errorCupo.textContent = errores.cupo ?? '';
    ui.hasta.classList.toggle('is-invalid', Boolean(errores.hasta));
    ui.errorHasta.textContent = errores.hasta ?? '';
    if (errores.cupo || errores.hasta) {
        (errores.cupo ? ui.cupo : ui.hasta).focus();
        return;
    }

    ocupado = true;
    ui.guardar.disabled = true;

    try {
        const { error: e } = await supabase
            .from('cooperativas')
            .update({ cupo_destacadas: Number(ui.cupo.value), destacadas_hasta: ui.hasta.value || null })
            .eq('id', c.id);
        if (e) throw e;

        await cargarCupos();
        mostrarAlerta(`Cupo de ${c.nombre} guardado.`, 'success');
    } catch (e) {
        console.error('No se pudo guardar el cupo:', e);
        // El mensaje de la base (cuántas debe desmarcar el gerente) va junto al campo.
        ui.cupo.classList.add('is-invalid');
        ui.errorCupo.textContent = error(e, 'guardar el cupo');
        ui.cupo.focus();
    } finally {
        ocupado = false;
        ui.guardar.disabled = false;
    }
}

/* ---------- Pestaña 2: banners ---------- */

async function cargarBanners() {
    const { data, error: e } = await supabase
        .from('publicidad_banners')
        .select('id, titulo, imagen_url, enlace, cooperativa_id, orden, activo, fecha_inicio, fecha_fin, creado_en')
        .order('orden', { ascending: true })
        .order('creado_en', { ascending: true });
    if (e) throw e;

    banners = data ?? [];
    dibujarBanners();
}

function dibujarBanners() {
    if (banners.length === 0) {
        filaInformativa(tablaBanners, 'No hay banners. Pulsa «+ Nuevo banner».');
        return;
    }

    const hoy = fechaHoyEcuador();
    const nombreCoop = id => cooperativas.find(c => c.id === id)?.nombre ?? '—';

    tablaBanners.replaceChildren(...banners.map((b, i) => {
        const tr = el('tr');
        if (!b.activo) tr.className = 'table-secondary';

        const tdOrden = el('td', 'text-nowrap');
        const subir = boton('↑', 'btn-outline-secondary px-2', () => void mover(b, -1), `Subir ${b.titulo}`);
        const bajar = boton('↓', 'btn-outline-secondary px-2 ms-1', () => void mover(b, 1), `Bajar ${b.titulo}`);
        subir.disabled = i === 0;
        bajar.disabled = i === banners.length - 1;
        tdOrden.append(`${i + 1} `, subir, bajar);

        const img = el('img', 'miniatura-banner');
        img.src = b.imagen_url;
        img.alt = `Banner: ${b.titulo}`;
        img.loading = 'lazy';
        const tdImagen = el('td');
        tdImagen.appendChild(img);

        const tdTitulo = el('td', 'text-break', b.titulo);
        if (b.enlace) tdTitulo.appendChild(el('div', 'small text-muted text-break', b.enlace));

        const estado = estadoBanner(b, hoy);
        const clases = { Publicado: 'bg-success', Programado: 'bg-info text-dark', Terminado: 'bg-secondary', Inactivo: 'bg-secondary' };
        const tdEstado = el('td');
        tdEstado.appendChild(el('span', `badge ${clases[estado]}`, estado));

        const tdAcciones = el('td', 'text-center text-nowrap');
        tdAcciones.append(
            boton('Editar', 'btn-outline-primary me-1', () => abrirEditar(b)),
            boton(b.activo ? 'Desactivar' : 'Activar', 'btn-outline-warning me-1', () => void cambiarActivo(b)),
            boton('Eliminar', 'btn-outline-danger', () => void eliminar(b))
        );

        tr.append(
            tdOrden,
            tdImagen,
            tdTitulo,
            el('td', 'text-break', nombreCoop(b.cooperativa_id)),
            el('td', 'text-nowrap', `${fechaCorta(b.fecha_inicio)} – ${fechaCorta(b.fecha_fin)}`),
            tdEstado,
            tdAcciones
        );
        return tr;
    }));
}

async function mover(b, direccion) {
    if (ocupado) return;
    const cambios = moverBanner(banners, b.id, direccion);
    if (!cambios) return;

    ocupado = true;
    try {
        for (const c of cambios) {
            const { error: e } = await supabase.from('publicidad_banners').update({ orden: c.orden }).eq('id', c.id);
            if (e) throw e;
        }
        await cargarBanners();
    } catch (e) {
        mostrarAlerta(error(e, 'cambiar el orden'), 'danger');
    } finally {
        ocupado = false;
    }
}

async function cambiarActivo(b) {
    if (ocupado) return;
    ocupado = true;
    try {
        const { error: e } = await supabase.from('publicidad_banners').update({ activo: !b.activo }).eq('id', b.id);
        if (e) throw e;
        await cargarBanners();
        mostrarAlerta(b.activo ? 'Banner desactivado.' : 'Banner activado.', 'success');
    } catch (e) {
        mostrarAlerta(error(e, 'cambiar el estado del banner'), 'danger');
    } finally {
        ocupado = false;
    }
}

async function borrarImagen(url) {
    const ruta = rutaDesdeUrl(url);
    if (!ruta) return;
    const { error: e } = await supabase.storage.from(IMAGEN_BANNER.bucket).remove([ruta]);
    if (e) console.warn('No se pudo borrar la imagen del banner:', e);
}

async function eliminar(b) {
    if (ocupado) return;
    if (!confirm(`¿Eliminar el banner «${b.titulo}»? Esta acción no se puede deshacer.`)) return;

    ocupado = true;
    try {
        const { error: e } = await supabase.from('publicidad_banners').delete().eq('id', b.id);
        if (e) throw e;
        await borrarImagen(b.imagen_url);
        await cargarBanners();
        mostrarAlerta('Banner eliminado.', 'success');
    } catch (e) {
        mostrarAlerta(error(e, 'eliminar el banner'), 'danger');
    } finally {
        ocupado = false;
    }
}

/* ---------- Formulario de banner ---------- */

function limpiarErrores() {
    errorBanner.classList.add('d-none');
    form.querySelectorAll('.is-invalid').forEach(c => c.classList.remove('is-invalid'));
}

function mostrarErrores(errores) {
    let primero = null;
    Object.entries(errores).forEach(([clave, texto]) => {
        const control = campo[clave];
        if (!control) return;
        control.classList.add('is-invalid');
        const aviso = form.querySelector(`[data-error="${clave}"]`);
        if (aviso) aviso.textContent = texto;
        primero ??= control;
    });
    primero?.focus();
}

function ponerVistaPrevia(src) {
    if (urlVistaPrevia) URL.revokeObjectURL(urlVistaPrevia);
    urlVistaPrevia = src?.startsWith('blob:') ? src : '';
    vistaPrevia.classList.toggle('d-none', !src);
    if (src) vistaPrevia.src = src; else vistaPrevia.removeAttribute('src');
}

function ponerAnunciantes(seleccionado = '') {
    const opciones = [new Option('Sin anunciante (MoviPass)', ''), ...cooperativas.map(c => new Option(c.nombre, c.id))];
    campo.cooperativaId.replaceChildren(...opciones);
    campo.cooperativaId.value = seleccionado ?? '';
}

function prepararFormulario(b = null) {
    form.reset();
    limpiarErrores();
    $('avisoMedidas').textContent = '';
    ponerAnunciantes(b?.cooperativa_id ?? '');

    const hoy = fechaHoyEcuador();
    campo.id.value = b?.id ?? '';
    campo.titulo.value = b?.titulo ?? '';
    campo.enlace.value = b?.enlace ?? '';
    campo.orden.value = b ? b.orden : (banners.length ? Math.min(999, Math.max(...banners.map(x => x.orden)) + 1) : 0);
    campo.activo.value = String(b ? b.activo : true);
    campo.fechaInicio.value = b?.fecha_inicio ?? hoy;
    campo.fechaFin.value = b?.fecha_fin ?? '';
    campo.imagen.required = !b;
    $('modalBannerLabel').textContent = b ? `Editar «${b.titulo}»` : 'Nuevo banner';
    ponerVistaPrevia(b?.imagen_url ?? '');
}

function abrirEditar(b) {
    prepararFormulario(b);
    modal.show();
}

campo.imagen.addEventListener('change', () => {
    campo.imagen.classList.remove('is-invalid');
    $('avisoMedidas').textContent = '';
    const archivo = campo.imagen.files[0];
    const actual = banners.find(b => b.id === campo.id.value);

    if (!archivo) {
        ponerVistaPrevia(actual?.imagen_url ?? '');
        return;
    }

    const problema = validarImagen(archivo);
    if (problema) {
        campo.imagen.classList.add('is-invalid');
        form.querySelector('[data-error="imagen"]').textContent = problema;
        ponerVistaPrevia(actual?.imagen_url ?? '');
        return;
    }

    ponerVistaPrevia(URL.createObjectURL(archivo));
    vistaPrevia.onload = () => {
        $('avisoMedidas').textContent = avisoMedidas(vistaPrevia.naturalWidth, vistaPrevia.naturalHeight);
    };
});

Object.values(campo).forEach(c => c.addEventListener('input', () => c.classList.remove('is-invalid')));

form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (ocupado) return;
    limpiarErrores();

    const valores = Object.fromEntries(Object.entries(campo).map(([k, c]) => [k, c.value]));
    const archivo = campo.imagen.files[0] ?? null;
    const actual = banners.find(b => b.id === valores.id) ?? null;
    const errores = revisarBanner(valores, { hoy: fechaHoyEcuador(), nuevo: !actual, archivo, tieneImagen: Boolean(actual) });

    if (Object.keys(errores).length) {
        mostrarErrores(errores);
        return;
    }

    ocupado = true;
    btnGuardar.disabled = true;
    const textoOriginal = btnGuardar.textContent;
    btnGuardar.textContent = 'Guardando...';
    let rutaNueva = '';

    try {
        const fila = datosBanner(valores);

        if (archivo) {
            rutaNueva = rutaImagen(crypto.randomUUID(), archivo.type);
            const { error: e } = await supabase.storage.from(IMAGEN_BANNER.bucket)
                .upload(rutaNueva, archivo, { contentType: archivo.type, upsert: false });
            if (e) throw e;
            fila.imagen_url = supabase.storage.from(IMAGEN_BANNER.bucket).getPublicUrl(rutaNueva).data.publicUrl;
        }

        const { error: e } = actual
            ? await supabase.from('publicidad_banners').update(fila).eq('id', actual.id)
            : await supabase.from('publicidad_banners').insert(fila);
        if (e) throw e;

        // La imagen anterior ya no se usa.
        if (actual && archivo) await borrarImagen(actual.imagen_url);
        rutaNueva = '';

        modal.hide();
        await cargarBanners();
        mostrarAlerta(actual ? 'Banner actualizado.' : 'Banner creado.', 'success');
    } catch (e) {
        console.error('No se pudo guardar el banner:', e);
        // Si la fila no se guardó, no se deja la imagen suelta en el bucket.
        if (rutaNueva) await supabase.storage.from(IMAGEN_BANNER.bucket).remove([rutaNueva]);
        errorBanner.textContent = error(e, 'guardar el banner');
        errorBanner.classList.remove('d-none');
    } finally {
        ocupado = false;
        btnGuardar.disabled = false;
        btnGuardar.textContent = textoOriginal;
    }
});

$('modalBanner').addEventListener('hidden.bs.modal', () => ponerVistaPrevia(''));

$('btnNuevoBanner').addEventListener('click', () => {
    prepararFormulario(null);
    modal.show();
});

/* ---------- Inicio ---------- */

async function iniciar() {
    const rol = await exigirRoles(['administrador']);
    if (!rol) return;

    try {
        await cargarCupos();
    } catch (e) {
        console.error('Error al cargar los cupos:', e);
        filaInformativa(tablaCupos, error(e, 'cargar las cooperativas'), 'text-danger');
    }

    try {
        await cargarBanners();
        $('btnNuevoBanner').disabled = false;
    } catch (e) {
        console.error('Error al cargar los banners:', e);
        filaInformativa(tablaBanners, error(e, 'cargar los banners'), 'text-danger');
    }
}

iniciar();

// Despacho del día (cambio 4, parte 4.1): el oficinista ve los viajes de hoy
// de su cooperativa y habilita cada uno a un usuario bus (por defecto, el
// usuario bus asignado a ese bus). El viaje queda "pendiente de inicio".
import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { obtenerContextoGestion } from '../../js/contextoUsuario.js';
import { mostrarAlerta } from '../../js/alertas.js';
import { formatearFecha, formatearHora } from '../../js/validaciones.js';
import { ponerOpciones } from '../../js/combos.js';
import { conBotonOcupado, limpiarAlEscribir, mostrarErrores } from '../../js/formularios.js';
import { mensajeErrorBase } from '../../js/erroresBase.js';
import {
    estadoOperativo, motivoNoHabilitable, revisarUsuarioBus, textoBus, textoTipoViaje,
    textoUsuarioBus, usuarioBusPorDefecto
} from '../../js/reglasOperacion.js';

const $ = (id) => document.getElementById(id);
const lista = $('listaViajes');

let cooperativas = [];
let despacho = { fecha: '', viajes: [], usuarios_bus: [] };

function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    return nodo;
}

function cooperativaActual() {
    return $('cooperativa').value || cooperativas[0]?.id || '';
}

async function cargar() {
    const { data, error } = await supabase.rpc('despacho_del_dia', { p_cooperativa_id: cooperativaActual() });
    if (error) throw error;

    despacho = data ?? { fecha: '', viajes: [], usuarios_bus: [] };
    dibujar();
}

function dibujarResumen() {
    const viajes = despacho.viajes ?? [];
    const contar = (estado) => viajes.filter((v) => v.estado_operativo === estado).length;

    $('fechaDespacho').textContent = despacho.fecha ? formatearFecha(despacho.fecha) : '';
    $('resumenDespacho').textContent = viajes.length === 0
        ? 'Sin viajes hoy.'
        : `${viajes.length} viaje(s): ${contar('programado')} por habilitar, ${contar('pendiente_inicio')} pendiente(s) de inicio, `
          + `${contar('en_curso')} en curso y ${contar('finalizado')} finalizado(s).`;
}

function dibujar() {
    dibujarResumen();
    lista.replaceChildren();

    const viajes = despacho.viajes ?? [];
    const usuarios = despacho.usuarios_bus ?? [];

    if (viajes.length === 0) {
        lista.appendChild(el('p', 'text-muted col-12', 'Hoy no hay viajes de tu cooperativa. Revisa la hoja de ruta.'));
        return;
    }

    if (usuarios.length === 0) {
        lista.appendChild(el('div', 'alert alert-warning col-12',
            'Tu cooperativa no tiene usuarios bus activos. Pide al gerente que los registre para poder habilitar los viajes.'));
    }

    viajes.forEach((viaje) => lista.appendChild(crearTarjeta(viaje, usuarios)));
}

function crearTarjeta(viaje, usuarios) {
    const estado = estadoOperativo(viaje.estado_operativo);
    const columna = el('div', 'col-md-6 col-xl-4');
    const tarjeta = el('div', 'card shadow-sm h-100');
    const cuerpo = el('div', 'card-body d-flex flex-column');

    const cabecera = el('div', 'd-flex justify-content-between align-items-start gap-2 mb-2');
    const titulo = el('div');
    titulo.append(
        el('div', 'fs-4 fw-bold', formatearHora(viaje.hora)),
        el('div', 'fw-semibold', `${viaje.origen} → ${viaje.destino}`)
    );
    cabecera.append(titulo, el('span', `badge ${estado.clase}`, estado.texto));

    const datos = el('ul', 'list-unstyled small mb-3');
    [
        `Bus ${textoBus(viaje.bus)}${viaje.grupo ? ` · Grupo ${viaje.grupo}` : ''}`,
        `${textoTipoViaje(viaje.tipo)} · ${viaje.boletos} boleto(s) vendido(s)`,
        viaje.usuario_bus ? `Habilitado a: ${textoUsuarioBus(viaje.usuario_bus)}` : 'Sin usuario bus habilitado'
    ].forEach((texto) => datos.appendChild(el('li', '', texto)));

    cuerpo.append(cabecera, datos);

    const motivo = motivoNoHabilitable(viaje);
    if (motivo) {
        cuerpo.appendChild(el('p', 'small text-muted mt-auto mb-0', motivo));

        // Cambio 4, parte 4.3: lo cobrado por el usuario bus en el camino.
        if (['en_curso', 'finalizado'].includes(viaje.estado_operativo)) {
            const enlace = el('a', 'btn btn-sm btn-outline-dark mt-2 align-self-start', 'Recaudación en ruta');
            enlace.href = `../usuario-bus/recaudacion.html?viaje=${encodeURIComponent(viaje.id)}`;
            cuerpo.appendChild(enlace);
        }
    } else {
        cuerpo.appendChild(crearFormulario(viaje, usuarios));
    }

    tarjeta.appendChild(cuerpo);
    columna.appendChild(tarjeta);
    return columna;
}

function crearFormulario(viaje, usuarios) {
    const form = el('form', 'mt-auto');
    form.noValidate = true;

    const idCampo = `usuarioBus-${viaje.id}`;
    const label = el('label', 'form-label small fw-semibold', 'Usuario bus *');
    label.htmlFor = idCampo;

    const select = el('select', 'form-select');
    select.id = idCampo;
    select.required = true;
    select.dataset.campo = 'usuario_bus';
    select.setAttribute('aria-describedby', `${idCampo}-error`);

    ponerOpciones(select, usuarios, {
        valor: (u) => u.id,
        texto: textoUsuarioBus,
        porDefecto: usuarioBusPorDefecto(viaje, usuarios),
        unica: false,
        vacio: 'No hay usuarios bus activos'
    });

    const aviso = el('div', 'invalid-feedback');
    aviso.id = `${idCampo}-error`;
    aviso.dataset.error = 'usuario_bus';

    const nota = el('div', 'form-text', viaje.bus?.usuario_bus_id
        ? 'Por defecto, el usuario bus asignado a este bus. * Campo obligatorio'
        : 'Este bus no tiene usuario bus asignado: elige uno. * Campo obligatorio');

    const acciones = el('div', 'd-flex flex-wrap gap-2 mt-2');
    const habilitado = viaje.estado_operativo === 'pendiente_inicio';

    const btnHabilitar = el('button', 'btn btn-primary flex-grow-1', habilitado ? 'Cambiar usuario bus' : 'Habilitar viaje');
    btnHabilitar.type = 'submit';
    acciones.appendChild(btnHabilitar);

    if (habilitado) {
        const btnQuitar = el('button', 'btn btn-outline-danger', 'Quitar habilitación');
        btnQuitar.type = 'button';
        btnQuitar.addEventListener('click', () => quitar(viaje, btnQuitar));
        acciones.appendChild(btnQuitar);
    }

    form.append(label, select, aviso, nota, acciones);
    limpiarAlEscribir(form);

    form.addEventListener('submit', (evento) => {
        evento.preventDefault();
        if (!mostrarErrores(form, { usuario_bus: revisarUsuarioBus(select.value, usuarios) })) return;
        habilitar(viaje, select.value, btnHabilitar, form);
    });

    return form;
}

async function habilitar(viaje, usuarioBusId, boton, form) {
    await conBotonOcupado(boton, 'Guardando...', async () => {
        const { error } = await supabase.rpc('habilitar_viaje', {
            p_viaje_id: viaje.id,
            p_usuario_bus_id: usuarioBusId
        });

        if (error) {
            console.error('No se pudo habilitar el viaje:', error);
            mostrarErrores(form, { usuario_bus: mensajeErrorBase(error, 'habilitar el viaje') });
            return;
        }

        const usuario = despacho.usuarios_bus.find((u) => u.id === usuarioBusId);
        mostrarAlerta(`Viaje de las ${formatearHora(viaje.hora)} habilitado a ${textoUsuarioBus(usuario)}. Queda pendiente de inicio.`, 'success');
        await recargar();
    });
}

async function quitar(viaje, boton) {
    if (!confirm(`¿Quitar la habilitación del viaje de las ${formatearHora(viaje.hora)}? El usuario bus ya no lo verá.`)) return;

    await conBotonOcupado(boton, 'Quitando...', async () => {
        const { error } = await supabase.rpc('quitar_habilitacion', { p_viaje_id: viaje.id });

        if (error) {
            console.error('No se pudo quitar la habilitación:', error);
            mostrarAlerta(mensajeErrorBase(error, 'quitar la habilitación'), 'danger');
            return;
        }

        mostrarAlerta('Se quitó la habilitación. El viaje vuelve a "Programado".', 'success');
        await recargar();
    });
}

async function recargar() {
    try {
        await cargar();
    } catch (error) {
        console.error('Error al cargar el despacho:', error);
        lista.replaceChildren(el('p', 'text-danger col-12', 'No se pudieron cargar los viajes de hoy.'));
        mostrarAlerta(mensajeErrorBase(error, 'cargar los viajes de hoy'), 'danger');
    }
}

$('btnActualizar').addEventListener('click', recargar);
$('cooperativa').addEventListener('change', recargar);

async function iniciar() {
    // Cambio 4: el gerente (rol cooperativa) también despacha los viajes de su cooperativa.
    const rol = await exigirRoles(['oficinista', 'cooperativa']);
    if (!rol) return;

    $('marca').href = `../${rol}/index.html`;
    $('btnVolver').href = `../${rol}/index.html`;
    if (rol === 'cooperativa') $('marca').textContent = 'MoviPass - Cooperativa';

    try {
        ({ cooperativas } = await obtenerContextoGestion());

        if (cooperativas.length === 0) {
            lista.replaceChildren(el('p', 'text-danger col-12',
                'Tu cuenta aún no está asignada a una cooperativa. Contacta al administrador.'));
            return;
        }

        ponerOpciones($('cooperativa'), cooperativas, { valor: (c) => c.id, texto: (c) => c.nombre });
        $('filaCooperativa').classList.toggle('d-none', cooperativas.length < 2);

        await recargar();
        // Los estados cambian cuando el usuario bus inicia o termina; no se
        // recarga mientras el oficinista está eligiendo en un formulario.
        setInterval(() => {
            if (!lista.contains(document.activeElement)) recargar();
        }, 60000);
    } catch (error) {
        console.error('Error al iniciar el despacho:', error);
        mostrarAlerta(mensajeErrorBase(error, 'cargar el despacho'), 'danger');
    }
}

iniciar();

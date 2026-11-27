// Mis viajes de hoy (cambio 4, parte 4.3): el usuario bus ve solo los viajes
// que la oficina le habilitó. Mientras el viaje está "pendiente de inicio",
// validar y vender están bloqueados; al iniciarlo se guarda la hora real de salida.
import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { obtenerPerfilPropio } from '../../js/auth.js';
import { mostrarAlerta } from '../../js/alertas.js';
import { dinero, formatearFecha, formatearHora } from '../../js/validaciones.js';
import { conBotonOcupado } from '../../js/formularios.js';
import { mensajeErrorBase } from '../../js/erroresBase.js';
import {
    accionesDelViaje, estadoOperativo, horaReal, textoBus, textoMisViajes, textoTipoViaje
} from '../../js/reglasOperacion.js';

const $ = (id) => document.getElementById(id);
const lista = $('listaViajes');

function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    return nodo;
}

function enlace(texto, clase, href) {
    const a = el('a', clase, texto);
    a.href = href;
    return a;
}

async function cargar() {
    const { data, error } = await supabase.rpc('mis_viajes_de_hoy');
    if (error) throw error;

    const viajes = data?.viajes ?? [];
    $('fechaHoy').textContent = data?.fecha ? formatearFecha(data.fecha) : '';
    $('resumenViajes').textContent = textoMisViajes(viajes.length);

    lista.replaceChildren();

    if (viajes.length === 0) {
        const vacio = el('div', 'card');
        const cuerpo = el('div', 'card-body text-center py-4');
        cuerpo.append(
            el('div', 'fs-1', '🚌'),
            el('p', 'fs-4 fw-bold mb-2', 'Hoy no tienes viajes asignados.'),
            el('p', 'mb-0', 'Cuando la oficina habilite un viaje a tu nombre, aparecerá aquí. Pulsa "Actualizar" para revisar.')
        );
        vacio.appendChild(cuerpo);
        lista.appendChild(vacio);
        return;
    }

    viajes.forEach((viaje) => lista.appendChild(crearTarjeta(viaje)));
}

function cifra(valor, texto) {
    const caja = el('div');
    caja.append(el('strong', '', String(valor)), el('span', '', texto));
    return caja;
}

function crearTarjeta(viaje) {
    const estado = estadoOperativo(viaje.estado_operativo);
    const acciones = accionesDelViaje(viaje);
    const urlViaje = `viaje.html?viaje=${encodeURIComponent(viaje.id)}`;

    const tarjeta = el('article', 'card mb-3');
    const cuerpo = el('div', 'card-body');

    const cabecera = el('div', 'd-flex justify-content-between align-items-start gap-2 mb-2');
    const titulo = el('div');
    titulo.append(
        el('div', 'viaje-hora', formatearHora(viaje.hora)),
        el('div', 'viaje-ruta', `${viaje.origen} → ${viaje.destino}`)
    );
    cabecera.append(titulo, el('span', `badge fs-6 ${estado.clase}`, estado.texto));

    const datos = el('ul', 'list-unstyled mb-3');
    [
        `Bus ${textoBus(viaje.bus)} · ${textoTipoViaje(viaje.tipo)}`,
        `Precio ${dinero(viaje.precio)} · ${viaje.cooperativa?.nombre ?? ''}`,
        viaje.salida_real ? `Salida real: ${horaReal(viaje.salida_real)}` : '',
        viaje.llegada_real ? `Llegada real: ${horaReal(viaje.llegada_real)}` : '',
        Number(viaje.en_ruta?.pasajeros) > 0
            ? `Venta en ruta: ${viaje.en_ruta.pasajeros} pasajero(s), ${dinero(viaje.en_ruta.total)} en efectivo`
            : ''
    ].filter(Boolean).forEach((texto) => datos.appendChild(el('li', '', texto)));

    const cifras = el('div', 'cifras mb-3');
    cifras.append(
        cifra(viaje.abordados ?? 0, 'abordaron'),
        cifra(viaje.por_abordar ?? 0, 'por abordar'),
        cifra(viaje.sin_pagar ?? 0, 'sin pagar'),
        cifra(Math.max(0, Number(viaje.asientos ?? 0) - Number(viaje.ocupados ?? 0)), 'libres')
    );

    cuerpo.append(cabecera, datos, cifras);

    const botones = el('div', 'd-grid gap-2');

    if (acciones.iniciar) {
        const btnIniciar = el('button', 'btn btn-success btn-xl', 'Iniciar viaje');
        btnIniciar.type = 'button';
        btnIniciar.addEventListener('click', () => iniciar(viaje, btnIniciar));
        botones.appendChild(btnIniciar);
    }

    if (acciones.validar) {
        botones.appendChild(enlace('Validar y vender', 'btn btn-primary btn-xl', urlViaje));
    } else if (viaje.estado_operativo === 'pendiente_inicio') {
        // Bloqueados hasta iniciar: se ven, pero no se pueden usar.
        const fila = el('div', 'd-flex gap-2');
        ['Validar', 'Vender'].forEach((texto) => {
            const b = el('button', 'btn btn-outline-dark btn-xl flex-fill', texto);
            b.type = 'button';
            b.disabled = true;
            b.title = acciones.aviso;
            fila.appendChild(b);
        });
        botones.appendChild(fila);
    }

    if (acciones.aviso) botones.appendChild(el('p', 'fw-semibold mb-0 text-center', acciones.aviso));

    if (acciones.manifiesto && !acciones.validar) {
        botones.appendChild(enlace('Ver manifiesto', 'btn btn-outline-dark btn-xl', `${urlViaje}#manifiesto`));
    }

    if (acciones.reporte) {
        botones.appendChild(enlace('Recaudación en ruta', 'btn btn-outline-dark btn-xl',
            `recaudacion.html?viaje=${encodeURIComponent(viaje.id)}`));
    }

    cuerpo.appendChild(botones);
    tarjeta.appendChild(cuerpo);
    return tarjeta;
}

async function iniciar(viaje, boton) {
    if (!confirm(`¿Iniciar el viaje de las ${formatearHora(viaje.hora)} (${viaje.origen} → ${viaje.destino})?\n` +
        'Se guardará la hora real de salida y ya no se venderá en la oficina ni en la app.')) return;

    await conBotonOcupado(boton, 'Iniciando...', async () => {
        const { error } = await supabase.rpc('iniciar_viaje', { p_viaje_id: viaje.id });

        if (error) {
            console.error('No se pudo iniciar el viaje:', error);
            mostrarAlerta(mensajeErrorBase(error, 'iniciar el viaje'), 'danger');
            await recargar();
            return false;
        }

        window.location.href = `viaje.html?viaje=${encodeURIComponent(viaje.id)}`;
        return true;
    });
}

async function recargar() {
    try {
        await cargar();
    } catch (error) {
        console.error('Error al cargar tus viajes:', error);
        lista.replaceChildren(el('p', 'text-danger fw-bold', 'No se pudieron cargar tus viajes.'));
        mostrarAlerta(mensajeErrorBase(error, 'cargar tus viajes'), 'danger');
    }
}

$('btnActualizar').addEventListener('click', recargar);

async function iniciarPagina() {
    const rol = await exigirRoles(['bus']);
    if (!rol) return;

    try {
        const perfil = await obtenerPerfilPropio();
        if (perfil?.nombres) $('saludo').textContent = `Hola, ${perfil.nombres.split(' ')[0]}.`;
    } catch (error) {
        console.warn('No se pudo leer el perfil:', error);
    }

    await recargar();
    // La oficina puede habilitar un viaje en cualquier momento.
    setInterval(() => {
        if (document.visibilityState === 'visible') recargar();
    }, 60000);
}

iniciarPagina();

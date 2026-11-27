// Operación del viaje (cambio 4, parte 4.3), desde el teléfono del usuario bus:
//  - Validar: QR con la cámara, código escrito, búsqueda por cédula o
//    marcar en el manifiesto. El boleto pasa a "abordado" (el asiento sigue
//    ocupado) y se muestra en grande la tarifa pagada.
//  - Vender en ruta: mapa en tiempo real (Realtime de boletos), datos del
//    pasajero, parada donde sube y cobro en efectivo. Boleto con QR.
//  - Manifiesto, iniciar y finalizar el viaje.
// Validar y vender solo con el viaje en curso; la base lo exige igual.
import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { mostrarAlerta } from '../../js/alertas.js';
import { dinero, formatearFecha, formatearHora } from '../../js/validaciones.js';
import { ponerOpciones } from '../../js/combos.js';
import { conBotonOcupado, limpiarAlEscribir, mostrarErrores, soloDigitos } from '../../js/formularios.js';
import { mensajeErrorBase } from '../../js/erroresBase.js';
import { revisarCedula } from '../../js/reglasCuenta.js';
import {
    LIMITES_COMPRA, MAX_ASIENTOS_COMPRA, pasajeroParaEnviar, resumenCobro, revisarPasajero
} from '../../js/reglasCompra.js';
import {
    FILTROS_MANIFIESTO, accionesDelViaje, conteoManifiesto, estadoBoleto, estadoOperativo, filtrarManifiesto,
    horaReal, normalizarCodigoBoleto, opcionesParada, resultadoValidacion, revisarCodigoBoleto, revisarParada,
    textoBus, textoTarifaPagada
} from '../../js/reglasOperacion.js';
import { ORIGENES_VENTA, crearBoletoImpreso, datosBoleto } from '../../js/boletoImpreso.js';
import {
    claseTipoAsiento, columnasDelMapa, crearAsientoBloqueado, crearCeldaEspecial, especialesPorPiso
} from '../../js/celdasEspeciales.js';

const $ = (id) => document.getElementById(id);
const viajeId = new URLSearchParams(window.location.search).get('viaje');

let viaje = null;
let boletos = [];
let tipos = [];
let seccion = '';

// Venta en ruta
let asientos = [];
let especiales = new Map();
let ocupados = new Set();
let seleccionados = [];
const datos = new Map();
const botonesAsiento = new Map();
let paradaElegida = '';

function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    return nodo;
}

const acciones = () => accionesDelViaje(viaje);

/* ======================================================================
   Carga del viaje y del manifiesto
   ====================================================================== */

async function cargarManifiesto() {
    const { data, error } = await supabase.rpc('manifiesto_del_viaje', { p_viaje_id: viajeId });
    if (error) throw error;

    const estadoAntes = viaje?.estado_operativo;
    viaje = data.viaje;
    boletos = data.boletos ?? [];

    dibujarCabecera();
    dibujarManifiesto();
    aplicarBloqueos();

    // El viaje cambió de estado (inicio o fin): se redibuja la venta.
    if (estadoAntes !== viaje.estado_operativo && acciones().vender) await prepararVenta();
}

function cifra(valor, texto) {
    const caja = el('div');
    caja.append(el('strong', '', String(valor)), el('span', '', texto));
    return caja;
}

function dibujarCabecera() {
    const estado = estadoOperativo(viaje.estado_operativo);
    const a = acciones();
    const conteo = conteoManifiesto(boletos, viaje.asientos);

    const cuerpo = el('div', 'card-body');

    const fila = el('div', 'd-flex justify-content-between align-items-start gap-2 mb-2');
    const titulo = el('div');
    titulo.append(
        el('div', 'viaje-hora', formatearHora(viaje.hora)),
        el('div', 'viaje-ruta', `${viaje.origen} → ${viaje.destino}`)
    );
    fila.append(titulo, el('span', `badge fs-6 ${estado.clase}`, estado.texto));

    const detalle = [
        `${formatearFecha(viaje.fecha)} · Bus ${textoBus(viaje.bus)}`,
        viaje.salida_real ? `Salida real ${horaReal(viaje.salida_real)}` : '',
        viaje.llegada_real ? `Llegada real ${horaReal(viaje.llegada_real)}` : ''
    ].filter(Boolean).join(' · ');

    const cifras = el('div', 'cifras my-3');
    cifras.append(
        cifra(conteo.abordados, 'abordaron'),
        cifra(conteo.porAbordar, 'por abordar'),
        cifra(conteo.sinPagar, 'sin pagar'),
        cifra(conteo.libres, 'libres')
    );

    cuerpo.append(fila, el('p', 'mb-0', detalle), cifras);

    const botones = el('div', 'd-grid gap-2');

    if (a.iniciar) {
        const btn = el('button', 'btn btn-success btn-xl', 'Iniciar viaje');
        btn.type = 'button';
        btn.addEventListener('click', () => iniciarViaje(btn));
        botones.appendChild(btn);
    }

    if (a.aviso) botones.appendChild(el('p', 'fw-bold mb-0 text-center', a.aviso));

    if (a.reporte) {
        const enlace = el('a', 'btn btn-outline-dark btn-xl',
            `Recaudación en ruta: ${dinero(viaje.en_ruta?.total ?? 0)}`);
        enlace.href = `recaudacion.html?viaje=${encodeURIComponent(viaje.id)}`;
        botones.appendChild(enlace);
    }

    if (a.finalizar) {
        const btn = el('button', 'btn btn-outline-danger btn-xl', 'Finalizar viaje');
        btn.type = 'button';
        btn.addEventListener('click', () => finalizarViaje(btn));
        botones.appendChild(btn);
    }

    cuerpo.appendChild(botones);
    $('cabeceraViaje').replaceChildren(cuerpo);
}

/** Validar y vender bloqueados si el viaje no está en curso. */
function aplicarBloqueos() {
    const a = acciones();

    $('zonaValidar').classList.toggle('d-none', !a.validar);
    $('validarBloqueado').classList.toggle('d-none', a.validar);
    $('validarBloqueado').textContent = a.aviso;

    const vendiendoResultado = !$('ventaResultado').classList.contains('d-none');
    $('zonaVender').classList.toggle('d-none', !a.vender || vendiendoResultado);
    $('venderBloqueado').classList.toggle('d-none', a.vender);
    $('venderBloqueado').textContent = a.aviso;

    if (!a.validar) detenerCamara();
}

/* ======================================================================
   Pestañas (barra inferior)
   ====================================================================== */

function mostrarSeccion(nombre) {
    seccion = nombre;
    const secciones = { validar: 'secValidar', vender: 'secVender', manifiesto: 'secManifiesto' };

    Object.entries(secciones).forEach(([clave, id]) => {
        $(id).classList.toggle('d-none', clave !== nombre);
    });

    document.querySelectorAll('.barra-inferior [data-seccion]').forEach((boton) => {
        boton.setAttribute('aria-selected', String(boton.dataset.seccion === nombre));
    });

    if (nombre !== 'validar') detenerCamara();
    history.replaceState(null, '', `#${nombre}`);
    window.scrollTo({ top: 0 });
}

document.querySelectorAll('.barra-inferior [data-seccion]').forEach((boton) => {
    boton.addEventListener('click', () => mostrarSeccion(boton.dataset.seccion));
});

/* ======================================================================
   Iniciar y finalizar
   ====================================================================== */

async function iniciarViaje(boton) {
    if (!confirm('¿Iniciar el viaje ahora? Se guardará la hora real de salida.')) return;

    await conBotonOcupado(boton, 'Iniciando...', async () => {
        const { error } = await supabase.rpc('iniciar_viaje', { p_viaje_id: viajeId });
        if (error) {
            console.error('No se pudo iniciar el viaje:', error);
            mostrarAlerta(mensajeErrorBase(error, 'iniciar el viaje'), 'danger');
            return;
        }
        mostrarAlerta('Viaje en curso. Ya puedes validar boletos y vender en ruta.', 'success');
        await recargar();
        mostrarSeccion('validar');
    });
}

async function finalizarViaje(boton) {
    const conteo = conteoManifiesto(boletos, viaje.asientos);
    const mensaje = `¿Finalizar el viaje ${viaje.origen} → ${viaje.destino}?\n` +
        `Abordaron ${conteo.abordados} pasajero(s); ${conteo.porAbordar} no se presentaron.\n` +
        `Venta en ruta: ${viaje.en_ruta?.pasajeros ?? 0} pasajero(s), ${dinero(viaje.en_ruta?.total ?? 0)} en efectivo.\n` +
        'Se guardará la hora real de llegada y se cerrarán las ventas y validaciones.';
    if (!confirm(mensaje)) return;

    await conBotonOcupado(boton, 'Finalizando...', async () => {
        const { error } = await supabase.rpc('finalizar_viaje', { p_viaje_id: viajeId });
        if (error) {
            console.error('No se pudo finalizar el viaje:', error);
            mostrarAlerta(mensajeErrorBase(error, 'finalizar el viaje'), 'danger');
            return false;
        }
        window.location.href = `recaudacion.html?viaje=${encodeURIComponent(viajeId)}`;
        return true;
    });
}

/* ======================================================================
   Validar
   ====================================================================== */

let validando = false;

async function validar({ codigo = null, boletoId = null }) {
    if (validando) return;
    validando = true;

    try {
        const { data, error } = await supabase.rpc('validar_boleto', {
            p_viaje_id: viajeId,
            p_codigo: codigo,
            p_boleto_id: boletoId
        });

        if (error) {
            console.error('No se pudo validar el boleto:', error);
            mostrarAlerta(mensajeErrorBase(error, 'validar el boleto'), 'danger');
            await recargar();
            return;
        }

        // El resultado (con la tarifa en grande) se ve en "Validar", aunque se
        // haya marcado desde el manifiesto; "Siguiente pasajero" regresa.
        const volverA = seccion;
        if (seccion !== 'validar') mostrarSeccion('validar');
        mostrarResultado(data, volverA);
        if (data?.resultado === 'abordado') await recargar();
    } finally {
        validando = false;
    }
}

function mostrarResultado(r, volverA = 'validar') {
    const caja = $('resultadoValidacion');
    const vista = resultadoValidacion(r?.resultado);
    const b = r?.boleto;

    caja.className = `resultado-validacion mb-3 ${vista.clase}`;
    caja.replaceChildren(el('div', 'resultado-titulo', `${vista.icono} ${vista.titulo}`));

    if (b) {
        caja.append(
            el('div', 'resultado-tarifa', textoTarifaPagada(b)),
            el('div', 'resultado-asiento', `Asiento ${b.numero_asiento} · ${dinero(b.precio)}`),
            el('div', 'fw-bold fs-5', `${b.apellidos} ${b.nombres} · ${b.cedula}`)
        );
    }

    caja.appendChild(el('div', 'resultado-mensaje', r?.mensaje ?? ''));

    const cerrar = el('button', 'btn btn-light btn-xl w-100 mt-3', 'Siguiente pasajero');
    cerrar.type = 'button';
    cerrar.addEventListener('click', () => {
        caja.classList.add('d-none');
        if (volverA && volverA !== 'validar') mostrarSeccion(volverA);
        else $('codigo').focus();
    });
    caja.appendChild(cerrar);

    $('resultadosCedula').replaceChildren();
    caja.classList.remove('d-none');
    caja.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        navigator.vibrate?.(r?.resultado === 'abordado' ? 120 : [200, 100, 200]);
    } catch (_) { /* sin vibración */ }
}

/* ---------- Código escrito ---------- */

const formCodigo = $('formCodigo');
limpiarAlEscribir(formCodigo);

formCodigo.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const texto = $('codigo').value;
    if (!mostrarErrores(formCodigo, { codigo: revisarCodigoBoleto(texto) })) return;

    await conBotonOcupado(formCodigo.querySelector('[type="submit"]'), 'Validando...', async () => {
        await validar({ codigo: normalizarCodigoBoleto(texto) });
        $('codigo').value = '';
    });
});

/* ---------- Cámara (QR) ---------- */

let lector = null;

function avisoCamara(texto) {
    $('avisoCamara').textContent = texto;
    $('avisoCamara').classList.toggle('d-none', !texto);
}

async function abrirCamara() {
    avisoCamara('');

    if (!window.isSecureContext) {
        avisoCamara('La cámara solo funciona en una página segura (https). Escribe el código del boleto.');
        return;
    }

    if (typeof globalThis.Html5Qrcode !== 'function') {
        avisoCamara('No se pudo cargar el lector de QR. Revisa tu conexión o escribe el código.');
        return;
    }

    $('lectorQR').classList.remove('d-none');
    $('btnEscanear').classList.add('d-none');
    $('btnDetener').classList.remove('d-none');

    try {
        lector = new globalThis.Html5Qrcode('lectorQR');
        await lector.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 230, height: 230 } },
            alLeerQR,
            () => { /* todavía no hay QR en la imagen */ }
        );
    } catch (error) {
        console.error('No se pudo abrir la cámara:', error);
        avisoCamara('No se pudo abrir la cámara. Permite el uso de la cámara en el navegador o escribe el código.');
        await detenerCamara();
    }
}

async function detenerCamara() {
    const actual = lector;
    lector = null;

    if (actual) {
        try {
            if (actual.isScanning) await actual.stop();
            actual.clear();
        } catch (error) {
            console.warn('No se pudo cerrar la cámara:', error);
        }
    }

    $('lectorQR').classList.add('d-none');
    $('btnEscanear').classList.remove('d-none');
    $('btnDetener').classList.add('d-none');
}

async function alLeerQR(texto) {
    if (validando) return;
    await detenerCamara();
    await validar({ codigo: normalizarCodigoBoleto(texto) });
}

$('btnEscanear').addEventListener('click', abrirCamara);
$('btnDetener').addEventListener('click', detenerCamara);

/* ---------- Búsqueda por cédula ---------- */

const formCedula = $('formCedula');
soloDigitos($('cedulaBuscar'));
limpiarAlEscribir(formCedula);

formCedula.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const cedula = $('cedulaBuscar').value.trim();
    if (!mostrarErrores(formCedula, { cedula: revisarCedula(cedula) })) return;

    await conBotonOcupado(formCedula.querySelector('[type="submit"]'), 'Buscando...', async () => {
        try {
            await cargarManifiesto();
        } catch (error) {
            mostrarAlerta(mensajeErrorBase(error, 'buscar al pasajero'), 'danger');
            return;
        }

        const encontrados = boletos.filter((b) => b.cedula === cedula);
        const zona = $('resultadosCedula');
        zona.replaceChildren();

        if (encontrados.length === 0) {
            zona.appendChild(el('p', 'fw-bold mb-0', `No hay boletos con la cédula ${cedula} en este viaje. Si tiene un QR, escanéalo: puede ser de otro viaje.`));
            return;
        }

        encontrados.forEach((b) => zona.appendChild(filaManifiesto(b)));
    });
});

/* ======================================================================
   Manifiesto
   ====================================================================== */

ponerOpciones($('filtroEstado'), FILTROS_MANIFIESTO, {
    valor: (f) => f.codigo, texto: (f) => f.nombre, todos: 'Todos'
});
$('filtroEstado').addEventListener('change', dibujarManifiesto);
$('buscarManifiesto').addEventListener('input', dibujarManifiesto);

function filaManifiesto(b) {
    const estado = estadoBoleto(b.estado);
    const fila = el('div', 'fila-manifiesto');

    const datosFila = el('div', 'datos');
    datosFila.append(
        el('div', 'nombre', `${b.apellidos} ${b.nombres}`),
        el('div', 'small', [
            b.cedula,
            b.tarifa ?? b.tipo,
            ORIGENES_VENTA[b.origen] ?? '',
            b.parada_subida ? `sube en ${b.parada_subida}` : ''
        ].filter(Boolean).join(' · '))
    );

    const lado = el('div', 'text-end');
    lado.appendChild(el('span', `badge ${estado.clase}`,
        b.estado === 'abordado' && b.abordado_en ? `${estado.texto} ${horaReal(b.abordado_en)}` : estado.texto));

    if (b.estado === 'emitido' && acciones().validar) {
        const boton = el('button', 'btn btn-success fw-bold d-block mt-2', 'Abordó ✔');
        boton.type = 'button';
        boton.setAttribute('aria-label', `Marcar asiento ${b.numero_asiento} como abordado`);
        boton.addEventListener('click', async () => {
            if (!confirm(`¿Marcar el asiento ${b.numero_asiento} (${b.apellidos} ${b.nombres}) como abordado?`)) return;
            await conBotonOcupado(boton, '...', () => validar({ boletoId: b.id }));
        });
        lado.appendChild(boton);
    }

    fila.append(el('div', 'asiento-num', String(b.numero_asiento)), datosFila, lado);
    return fila;
}

function dibujarManifiesto() {
    const conteo = conteoManifiesto(boletos, viaje?.asientos);
    $('cifrasManifiesto').replaceChildren(
        cifra(conteo.abordados, 'abordaron'),
        cifra(conteo.porAbordar, 'por abordar'),
        cifra(conteo.sinPagar, 'sin pagar'),
        cifra(conteo.libres, 'libres')
    );

    const lista = $('listaManifiesto');
    lista.replaceChildren();

    const filtrados = filtrarManifiesto(boletos, {
        estado: $('filtroEstado').value,
        texto: $('buscarManifiesto').value
    });

    if (boletos.length === 0) {
        lista.appendChild(el('p', 'fw-bold', 'Todavía no hay pasajeros en este viaje.'));
        return;
    }

    if (filtrados.length === 0) {
        lista.appendChild(el('p', 'fw-bold', 'Ningún pasajero coincide con la búsqueda.'));
        return;
    }

    filtrados.forEach((b) => lista.appendChild(filaManifiesto(b)));
}

/* ======================================================================
   Vender en ruta
   ====================================================================== */

function textoSuave(texto, clase = '') {
    return el('p', `text-center mb-0 ${clase}`, texto);
}

async function cargarMapa() {
    const { data, error } = await supabase.rpc('mapa_del_viaje', { p_viaje_id: viajeId });
    if (error) throw error;

    asientos = data?.asientos ?? [];
    especiales = especialesPorPiso(data?.distribucion);
    ocupados = new Set((data?.ocupados ?? []).map(Number));

    const antes = seleccionados.length;
    seleccionados = seleccionados.filter((n) => !ocupados.has(n));
    if (seleccionados.length !== antes) {
        mostrarAlerta('Un asiento que elegiste acaba de ocuparse y se quitó de la venta.', 'warning');
        dibujarPasajeros();
        actualizarResumen();
    }
}

async function prepararVenta() {
    ponerParadas();
    $('mapaAsientos').replaceChildren(textoSuave('Cargando asientos...'));

    try {
        await cargarMapa();
        dibujarMapa();
        dibujarPasajeros();
        actualizarResumen();
    } catch (error) {
        console.error('No se pudo cargar el mapa:', error);
        $('mapaAsientos').replaceChildren(textoSuave('No se pudo cargar el mapa de asientos.', 'text-danger fw-bold'));
        mostrarAlerta(mensajeErrorBase(error, 'cargar el mapa de asientos'), 'danger');
    }
}

function ponerParadas() {
    ponerOpciones($('parada'), opcionesParada(viaje), {
        valor: (o) => o.codigo,
        texto: (o) => o.nombre,
        porDefecto: paradaElegida
    });
}

$('parada').addEventListener('change', () => { paradaElegida = $('parada').value; });

function crearBotonAsiento(asiento) {
    if (asiento.tipo === 'bloqueado') return crearAsientoBloqueado(asiento, 'asiento bloqueado');

    const b = el('button', 'asiento' + claseTipoAsiento(asiento.tipo), String(asiento.numero));
    b.type = 'button';
    b.setAttribute('aria-label', `Asiento ${asiento.numero}`);
    b.addEventListener('click', () => alternarAsiento(asiento.numero));
    botonesAsiento.set(asiento.numero, b);
    return b;
}

function dibujarMapa() {
    const mapa = $('mapaAsientos');
    mapa.replaceChildren();
    botonesAsiento.clear();

    if (asientos.length === 0) {
        mapa.appendChild(textoSuave('Este bus no tiene asientos configurados. Avisa a la oficina.', 'text-danger fw-bold'));
        return;
    }

    const pisos = [...new Set(asientos.map((a) => a.piso ?? 1))].sort();

    pisos.forEach((piso) => {
        const delPiso = asientos.filter((a) => (a.piso ?? 1) === piso);
        if (pisos.length > 1) mapa.appendChild(el('h3', 'h6 text-center mt-2', `Piso ${piso}`));

        if (!delPiso.every((a) => a.fila != null && a.columna != null)) {
            const libres = el('div', 'asientos-libres');
            delPiso.forEach((a) => libres.appendChild(crearBotonAsiento(a)));
            mapa.appendChild(libres);
            return;
        }

        const especialesPiso = especiales.get(piso) ?? [];
        const maxColumna = Math.max(...delPiso.map((a) => a.columna), ...especialesPiso.map((c) => c.columna));
        const porPosicion = new Map(delPiso.map((a) => [`${a.fila}-${a.columna}`, a]));
        const especialPorPosicion = new Map(especialesPiso.map((c) => [`${c.fila}-${c.columna}`, c]));
        const filas = [...new Set([...delPiso.map((a) => a.fila), ...especialesPiso.map((c) => c.fila)])]
            .sort((x, y) => x - y);

        const grid = el('div', 'asientos-grid');
        grid.style.gridTemplateColumns = columnasDelMapa(maxColumna, filas, especialesPiso, '48px', '20px');

        filas.forEach((fila) => {
            for (let col = 1; col <= maxColumna; col++) {
                const asiento = porPosicion.get(`${fila}-${col}`);
                const especial = especialPorPosicion.get(`${fila}-${col}`);
                grid.appendChild(asiento ? crearBotonAsiento(asiento)
                    : especial ? crearCeldaEspecial(especial, 'asiento-bano')
                        : document.createElement('div'));
            }
        });

        mapa.appendChild(grid);
    });

    pintarAsientos();
}

function pintarAsientos() {
    botonesAsiento.forEach((boton, numero) => {
        const ocupado = ocupados.has(numero);
        const elegido = seleccionados.includes(numero);
        boton.disabled = ocupado;
        boton.classList.toggle('ocupado', ocupado);
        boton.classList.toggle('seleccionado', elegido);
        boton.setAttribute('aria-pressed', String(elegido));
        boton.title = ocupado ? `Asiento ${numero} (ocupado)` : `Asiento ${numero}`;
    });
}

function alternarAsiento(numero) {
    if (ocupados.has(numero)) return;

    if (seleccionados.includes(numero)) {
        seleccionados = seleccionados.filter((n) => n !== numero);
    } else {
        if (seleccionados.length >= MAX_ASIENTOS_COMPRA) {
            mostrarAlerta(`Máximo ${MAX_ASIENTOS_COMPRA} asientos por venta.`, 'warning');
            return;
        }
        seleccionados = [...seleccionados, numero].sort((a, b) => a - b);
        if (!datos.has(numero)) datos.set(numero, { cedula: '', nombres: '', apellidos: '', tipo: 'normal' });
    }

    pintarAsientos();
    dibujarPasajeros();
    actualizarResumen();
}

/* ---------- Pasajeros ---------- */

function campoTexto(etiqueta, clave, valor, { maxLength = LIMITES_COMPRA.nombre, inputMode = '' } = {}) {
    const col = el('div', 'col-12');
    const id = `campo-${clave}`;
    const label = el('label', 'form-label', etiqueta);
    label.htmlFor = id;

    const input = el('input', 'form-control');
    input.id = id;
    input.type = 'text';
    input.value = valor;
    input.required = true;
    input.maxLength = maxLength;
    input.autocomplete = 'off';
    input.dataset.campo = clave;
    if (inputMode) input.inputMode = inputMode;
    input.setAttribute('aria-describedby', `${id}-error`);

    const aviso = el('div', 'invalid-feedback');
    aviso.id = `${id}-error`;
    aviso.dataset.error = clave;

    col.append(label, input, aviso);
    return { col, input };
}

function dibujarPasajeros() {
    const lista = $('listaPasajeros');
    lista.replaceChildren();

    if (seleccionados.length === 0) {
        lista.appendChild(el('p', 'mb-0', 'Elige al menos un asiento en el mapa.'));
        return;
    }

    seleccionados.forEach((numero) => {
        const d = datos.get(numero);
        const tarjeta = el('div', 'border border-2 border-dark rounded p-3 mb-3');
        tarjeta.appendChild(el('h3', 'h5 mb-2', `Asiento ${numero}`));

        const fila = el('div', 'row g-2');
        const cedula = campoTexto('Cédula *', `cedula-${numero}`, d.cedula, { maxLength: 10, inputMode: 'numeric' });
        const nombres = campoTexto('Nombres *', `nombres-${numero}`, d.nombres);
        const apellidos = campoTexto('Apellidos *', `apellidos-${numero}`, d.apellidos);

        const colTipo = el('div', 'col-12');
        const labelTipo = el('label', 'form-label', 'Tarifa *');
        labelTipo.htmlFor = `campo-tipo-${numero}`;
        const selectTipo = el('select', 'form-select');
        selectTipo.id = `campo-tipo-${numero}`;
        selectTipo.required = true;
        ponerOpciones(selectTipo, tipos, {
            valor: (t) => t.codigo,
            texto: (t) => (Number(t.descuento) > 0 ? `${t.nombre} (−${Number(t.descuento)} %)` : t.nombre),
            inicial: null,
            porDefecto: d.tipo || 'normal',
            vacio: 'No hay tarifas'
        });
        colTipo.append(labelTipo, selectTipo);

        cedula.input.addEventListener('input', () => {
            cedula.input.value = cedula.input.value.replace(/\D/g, '');
            d.cedula = cedula.input.value;
            cedula.input.classList.remove('is-invalid');
        });
        cedula.input.addEventListener('blur', () => autocompletar(numero));
        nombres.input.addEventListener('input', () => { d.nombres = nombres.input.value; nombres.input.classList.remove('is-invalid'); });
        apellidos.input.addEventListener('input', () => { d.apellidos = apellidos.input.value; apellidos.input.classList.remove('is-invalid'); });
        selectTipo.addEventListener('change', () => { d.tipo = selectTipo.value; actualizarResumen(); });

        fila.append(cedula.col, colTipo, nombres.col, apellidos.col);
        tarjeta.appendChild(fila);
        lista.appendChild(tarjeta);
    });
}

async function autocompletar(numero) {
    const d = datos.get(numero);
    if (!d || revisarCedula(d.cedula) || d.nombres.trim() || d.apellidos.trim()) return;

    try {
        const { data, error } = await supabase.rpc('buscar_pasajero', { p_cedula: d.cedula.trim() });
        if (error || !data || d.nombres.trim() || d.apellidos.trim()) return;

        d.nombres = data.nombres;
        d.apellidos = data.apellidos;
        if ($(`campo-nombres-${numero}`)) $(`campo-nombres-${numero}`).value = data.nombres;
        if ($(`campo-apellidos-${numero}`)) $(`campo-apellidos-${numero}`).value = data.apellidos;
    } catch (error) {
        console.warn('No se pudo buscar al pasajero:', error);
    }
}

/* ---------- Cobro ---------- */

function resumenActual() {
    return resumenCobro(
        viaje.precio,
        seleccionados.map((numero) => ({ numero_asiento: numero, tipo: datos.get(numero).tipo })),
        tipos
    );
}

function filaResumen(texto, valor, clase = '') {
    const tr = el('tr', clase);
    tr.append(el('td', '', texto), el('td', 'text-end', valor));
    return tr;
}

function actualizarResumen() {
    const tabla = $('resumenCobro');
    tabla.replaceChildren();
    $('btnCobrar').disabled = seleccionados.length === 0 || !acciones().vender;

    if (seleccionados.length === 0) {
        tabla.appendChild(filaResumen('Sin asientos elegidos.', ''));
        return;
    }

    const r = resumenActual();
    r.lineas.forEach((l) => tabla.appendChild(
        filaResumen(`Asiento ${l.numero_asiento} · ${l.tarifa}${l.descuento > 0 ? ` (−${l.descuento} %)` : ''}`, dinero(l.precio))));
    if (r.descuento > 0) tabla.appendChild(filaResumen('Descuentos', `−${dinero(r.descuento)}`, 'border-top'));
    tabla.appendChild(filaResumen('Total a cobrar en efectivo', dinero(r.total), 'table-dark fw-bold fs-5'));
}

const formVenta = $('formVenta');
limpiarAlEscribir(formVenta);

formVenta.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (seleccionados.length === 0) return;

    const errores = { parada: revisarParada($('parada').value, opcionesParada(viaje)) };
    seleccionados.forEach((numero) => {
        const problemas = revisarPasajero(datos.get(numero));
        ['cedula', 'nombres', 'apellidos'].forEach((campo) => {
            errores[`${campo}-${numero}`] = problemas[campo] ?? '';
        });
    });
    if (!mostrarErrores(formVenta, errores)) return;

    const { total } = resumenActual();
    if (!confirm(`¿Cobrar ${dinero(total)} en efectivo y emitir ${seleccionados.length} boleto(s)?`)) return;

    await conBotonOcupado($('btnCobrar'), 'Registrando...', async () => {
        const { data, error } = await supabase.rpc('vender_en_ruta', {
            p_viaje_id: viajeId,
            p_pasajeros: seleccionados.map((numero) => pasajeroParaEnviar(numero, datos.get(numero))),
            p_parada: $('parada').value
        });

        if (error) {
            console.error('No se pudo registrar la venta en ruta:', error);
            mostrarAlerta(mensajeErrorBase(error, 'registrar la venta'), 'danger');
            await recargar();
            return;
        }

        mostrarVenta(data);
        await recargar();
    });
});

function mostrarVenta(venta) {
    $('zonaVender').classList.add('d-none');
    $('ventaResultado').classList.remove('d-none');
    $('totalCobrado').textContent = dinero(venta.total);

    const datosViaje = {
        origen: viaje.origen,
        destino: viaje.destino,
        fecha: viaje.fecha,
        hora: viaje.hora,
        bus: textoBus(viaje.bus),
        cooperativa: viaje.cooperativa?.nombre ?? ''
    };

    $('boletos').replaceChildren(...venta.boletos.map((b) =>
        crearBoletoImpreso(datosBoleto(b, datosViaje, { tipos, origen: 'EN_RUTA' }), { descargar: true })));

    seleccionados = [];
    datos.clear();
    window.scrollTo({ top: 0 });
}

$('btnImprimir').addEventListener('click', () => window.print());

$('btnNuevaVenta').addEventListener('click', () => {
    $('ventaResultado').classList.add('d-none');
    $('boletos').replaceChildren();
    aplicarBloqueos();
    dibujarMapa();
    dibujarPasajeros();
    actualizarResumen();
});

/* ======================================================================
   Tiempo real: boletos del viaje (ventas de la oficina, la app y en ruta)
   ====================================================================== */

let temporizador = null;

function programarRecarga() {
    clearTimeout(temporizador);
    temporizador = setTimeout(recargar, 400);
}

function escucharBoletos() {
    supabase
        .channel(`boletos-viaje-${viajeId}`)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'boletos', filter: `viaje_id=eq.${viajeId}` },
            programarRecarga)
        .subscribe((estado) => {
            const enVivo = estado === 'SUBSCRIBED';
            $('enVivo').textContent = enVivo ? '● En vivo' : 'Sin conexión en vivo';
            $('enVivo').className = `en-vivo ${enVivo ? 'text-success' : 'text-danger'}`;
        });
}

async function recargar() {
    try {
        await cargarManifiesto();
        if (acciones().vender) {
            await cargarMapa();
            pintarAsientos();
        }
    } catch (error) {
        console.error('Error al actualizar el viaje:', error);
        mostrarAlerta(mensajeErrorBase(error, 'actualizar el viaje'), 'danger');
    }
}

/* ======================================================================
   Inicio
   ====================================================================== */

async function iniciar() {
    const rol = await exigirRoles(['bus']);
    if (!rol) return;

    if (!viajeId) {
        window.location.replace('index.html');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('tipos_pasajero')
            .select('codigo, nombre, descuento, activo')
            .order('descuento', { ascending: true });
        if (error) throw error;
        tipos = (data ?? []).filter((t) => t.activo !== false);

        // Si el viaje está en curso, cargarManifiesto() también prepara la venta.
        await cargarManifiesto();

        const pedida = window.location.hash.replace('#', '');
        mostrarSeccion(['validar', 'vender', 'manifiesto'].includes(pedida)
            ? pedida
            : acciones().validar ? 'validar' : 'manifiesto');

        escucharBoletos();
    } catch (error) {
        console.error('Error al abrir el viaje:', error);
        $('cabeceraViaje').replaceChildren(el('div', 'card-body fw-bold text-danger',
            mensajeErrorBase(error, 'abrir el viaje')));
        document.querySelector('.barra-inferior').classList.add('d-none');
        ['secValidar', 'secVender', 'secManifiesto'].forEach((id) => $(id).classList.add('d-none'));
    }
}

iniciar();

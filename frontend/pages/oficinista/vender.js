import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { obtenerContextoGestion, textoError } from '../../js/contextoUsuario.js';
import { mostrarAlerta } from '../../js/alertas.js';
import {
    cedulaValida, sumarDias, formatearFecha, formatearHora, dinero
} from '../../js/validaciones.js'; // <-- Ruta corregida
import { obtenerCeldasEspecialesDeBus } from '../../js/asientosService.js';
import { claseTipoAsiento, columnasDelMapa, crearAsientoBloqueado, crearCeldaEspecial } from '../../js/celdasEspeciales.js';
import { fechaHoyEcuador, ponerOpciones } from '../../js/combos.js';
import {
    LIMITES_COMPRA, MAX_ASIENTOS_COMPRA, pasajeroParaEnviar, precioConDescuento, resumenCobro as calcularResumen, revisarPasajero
} from '../../js/reglasCompra.js';
import { horaEcuador, textoBus, viajesVendibles } from '../../js/reglasOperacion.js';
import { crearBoletoImpreso, datosBoleto } from '../../js/boletoImpreso.js';

const MAX_ASIENTOS = MAX_ASIENTOS_COMPRA;
const DIAS_VISIBLES = 14; // igual que la hoja de ruta: hoy y hasta 14 días

const $ = (id) => document.getElementById(id);

const paso1 = $('paso1');
const paso2 = $('paso2');
const resultado = $('resultado');
const tablaViajes = $('tablaViajes');
const mapa = $('mapaAsientos');
const listaPasajeros = $('listaPasajeros');
const resumenCobro = $('resumenCobro');
const btnConfirmar = $('btnConfirmar');

let cooperativas = [];
let tipos = [];
let viajes = [];
let viaje = null;
let asientos = [];
let especiales = new Map(); // baño por piso: se muestra bloqueado
let ocupados = new Set();
let seleccionados = [];
const datos = new Map();
const botonesAsiento = new Map();

/* ======================================================================
   PASO 1: elegir viaje
   ====================================================================== */

function filaInformativa(texto, clase = 'text-muted') {
    tablaViajes.replaceChildren();
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = `text-center py-3 ${clase}`;
    td.textContent = texto;
    tr.appendChild(td);
    tablaViajes.appendChild(tr);
}

function celda(texto) {
    const td = document.createElement('td');
    td.textContent = texto;
    return td;
}

async function cargarViajes() {
    const hoy = fechaHoyEcuador();

    const { data, error } = await supabase
        .from('viajes')
        .select(`
            id, fecha, precio, bus_id, estado_operativo,
            frecuencias!inner ( origen, destino, hora, activa ),
            buses!inner ( placa, numero_interno, tipo_bus, cooperativa_id ),
            hojas_ruta ( estado )
        `)
        .in('buses.cooperativa_id', cooperativas.map((c) => c.id))
        .eq('frecuencias.activa', true)
        .gte('fecha', hoy)
        .lte('fecha', sumarDias(hoy, DIAS_VISIBLES))
        // Solo viajes a la venta (columna calculada public.a_la_venta, hora de Ecuador).
        .eq('a_la_venta', true)
        .order('fecha', { ascending: true });

    if (error) throw error;

    // Fecha y hora de Ecuador: no se venden viajes que ya salieron, en curso ni finalizados.
    viajes = viajesVendibles(data ?? [], hoy, horaEcuador());

    dibujarViajes();
}

function dibujarViajes() {
    const origen = $('filtroOrigen').value.trim().toLowerCase();
    const destino = $('filtroDestino').value.trim().toLowerCase();
    const fecha = $('filtroFecha').value;

    const filtrados = viajes.filter((v) =>
        v.frecuencias.origen.toLowerCase().includes(origen) &&
        v.frecuencias.destino.toLowerCase().includes(destino) &&
        (!fecha || v.fecha === fecha));

    if (filtrados.length === 0) {
        filaInformativa(fecha === fechaHoyEcuador()
            ? 'Ya no quedan viajes para hoy con esos filtros. Prueba con la fecha de mañana.'
            : 'No hay viajes disponibles con esos filtros.');
        return;
    }

    tablaViajes.replaceChildren();

    filtrados.forEach((v) => {
        const tr = document.createElement('tr');

        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'btn btn-sm btn-primary';
        boton.textContent = 'Vender';
        boton.addEventListener('click', () => elegirViaje(v));

        const tdAccion = document.createElement('td');
        tdAccion.className = 'text-center';
        tdAccion.appendChild(boton);

        tr.append(
            celda(formatearFecha(v.fecha)),
            celda(formatearHora(v.frecuencias.hora)),
            celda(`${v.frecuencias.origen} → ${v.frecuencias.destino}`),
            celda(`${textoBus(v.buses)} · ${v.buses.tipo_bus}`),
            celda(dinero(v.precio)),
            tdAccion
        );
        tablaViajes.appendChild(tr);
    });
}

['filtroOrigen', 'filtroDestino', 'filtroFecha'].forEach((id) =>
    $(id).addEventListener('input', dibujarViajes));

$('btnLimpiar').addEventListener('click', () => {
    $('filtroOrigen').value = '';
    $('filtroDestino').value = '';
    $('filtroFecha').value = fechaHoyEcuador(); // punto de venta: los viajes del día
    dibujarViajes();
});

/* ======================================================================
   PASO 2: asientos y pasajeros
   ====================================================================== */

async function elegirViaje(v) {
    viaje = v;
    seleccionados = [];
    datos.clear();

    $('infoViaje').textContent =
        `${v.frecuencias.origen} → ${v.frecuencias.destino} · ${formatearFecha(v.fecha)} a las ` +
        `${formatearHora(v.frecuencias.hora)} · Bus ${textoBus(v.buses)} · Tarifa normal ${dinero(v.precio)}`;

    paso1.classList.add('d-none');
    paso2.classList.remove('d-none');
    mapa.replaceChildren(textoSuave('Cargando asientos...'));

    try {
        const { data, error } = await supabase
            .from('asientos')
            .select('*')
            .eq('bus_id', v.bus_id)
            .order('numero', { ascending: true });

        if (error) throw error;
        asientos = data ?? [];

        // El baño solo se dibuja; si no se puede leer, el mapa funciona sin él.
        try {
            especiales = await obtenerCeldasEspecialesDeBus(v.bus_id);
        } catch (errorEspeciales) {
            console.warn('No se pudo cargar el baño del bus:', errorEspeciales);
            especiales = new Map();
        }

        await actualizarOcupados();
        dibujarMapa();
        dibujarPasajeros();
        actualizarResumen();
    } catch (error) {
        console.error('Error al cargar los asientos:', error);
        mapa.replaceChildren(textoSuave('No se pudieron cargar los asientos.', 'text-danger'));
        mostrarAlerta(textoError(error), 'danger');
    }
}

function textoSuave(texto, clase = 'text-muted') {
    const p = document.createElement('p');
    p.className = `${clase} text-center mb-0`;
    p.textContent = texto;
    return p;
}

async function actualizarOcupados() {
    const { data, error } = await supabase.rpc('asientos_ocupados', { p_viaje_id: viaje.id });
    if (error) throw error;
    ocupados = new Set(data ?? []);
    const antes = seleccionados.length;
    seleccionados = seleccionados.filter((n) => !ocupados.has(n));
    if (seleccionados.length !== antes) {
        mostrarAlerta('Algún asiento que elegiste ya fue ocupado y se quitó de tu selección.', 'warning');
    }
}

function crearBotonAsiento(asiento) {
    // Bloqueado: se ve, pero nunca se puede elegir.
    if (asiento.tipo === 'bloqueado') return crearAsientoBloqueado(asiento, 'asiento bloqueado');

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'asiento' + claseTipoAsiento(asiento.tipo);
    b.textContent = asiento.numero;
    b.dataset.numero = asiento.numero;
    b.setAttribute('aria-label', `Asiento ${asiento.numero}`);
    b.addEventListener('click', () => alternarAsiento(asiento.numero));
    botonesAsiento.set(asiento.numero, b);
    return b;
}

function dibujarMapa() {
    mapa.replaceChildren();
    botonesAsiento.clear();

    if (asientos.length === 0) {
        mapa.appendChild(textoSuave('Este bus todavía no tiene asientos configurados.', 'text-danger'));
        return;
    }

    const pisos = [...new Set(asientos.map((a) => a.piso ?? 1))].sort();

    pisos.forEach((piso) => {
        const delPiso = asientos.filter((a) => (a.piso ?? 1) === piso);

        if (pisos.length > 1) {
            const titulo = document.createElement('h3');
            titulo.className = 'h6 text-center mt-2';
            titulo.textContent = `Piso ${piso}`;
            mapa.appendChild(titulo);
        }

        const conPosicion = delPiso.every((a) => a.fila != null && a.columna != null);

        if (!conPosicion) {
            const contenedor = document.createElement('div');
            contenedor.className = 'asientos-libres';
            delPiso.forEach((a) => contenedor.appendChild(crearBotonAsiento(a)));
            mapa.appendChild(contenedor);
            return;
        }

        const especialesPiso = especiales.get(piso) ?? [];
        const maxColumna = Math.max(
            ...delPiso.map((a) => a.columna),
            ...especialesPiso.map((c) => c.columna)
        );
        const porPosicion = new Map(delPiso.map((a) => [`${a.fila}-${a.columna}`, a]));
        const especialPorPosicion = new Map(especialesPiso.map((c) => [`${c.fila}-${c.columna}`, c]));
        const filas = [...new Set([
            ...delPiso.map((a) => a.fila),
            ...especialesPiso.map((c) => c.fila)
        ])].sort((x, y) => x - y);

        const grid = document.createElement('div');
        grid.className = 'asientos-grid';
        // El pasillo viene en la plantilla (cambio 6): las columnas de solo pasillo son angostas.
        grid.style.gridTemplateColumns = columnasDelMapa(maxColumna, filas, especialesPiso, '44px', '20px');

        filas.forEach((fila) => {
            for (let col = 1; col <= maxColumna; col++) {
                const asiento = porPosicion.get(`${fila}-${col}`);
                const especial = especialPorPosicion.get(`${fila}-${col}`);
                grid.appendChild(
                    asiento ? crearBotonAsiento(asiento)
                        : especial ? crearCeldaEspecial(especial, 'asiento-bano')
                        : document.createElement('div')
                );
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
        if (seleccionados.length >= MAX_ASIENTOS) {
            mostrarAlerta(`Máximo ${MAX_ASIENTOS} asientos por venta.`, 'warning');
            return;
        }
        seleccionados = [...seleccionados, numero].sort((a, b) => a - b);
        if (!datos.has(numero)) datos.set(numero, { cedula: '', nombres: '', apellidos: '', tipo: 'normal' });
    }

    pintarAsientos();
    dibujarPasajeros();
    actualizarResumen();
}

$('btnActualizarMapa').addEventListener('click', async () => {
    try {
        await actualizarOcupados();
        pintarAsientos();
        dibujarPasajeros();
        actualizarResumen();
    } catch (error) {
        mostrarAlerta(textoError(error), 'danger');
    }
});

/* ---------- Formularios de pasajeros ---------- */

function crearCampo(etiqueta, id, valor, atributos = {}) {
    const col = document.createElement('div');
    col.className = atributos.col ?? 'col-md-6';

    const label = document.createElement('label');
    label.className = 'form-label small mb-1';
    label.htmlFor = id;
    label.textContent = etiqueta;

    const input = document.createElement('input');
    input.className = 'form-control form-control-sm';
    input.id = id;
    input.value = valor;
    input.type = 'text';
    input.required = true;
    input.maxLength = atributos.maxLength ?? LIMITES_COMPRA.nombre;
    if (atributos.inputMode) input.inputMode = atributos.inputMode;
    if (atributos.autocomplete) input.autocomplete = atributos.autocomplete;

    // Mensaje junto al campo.
    const aviso = document.createElement('div');
    aviso.className = 'invalid-feedback';
    aviso.id = `${id}-error`;
    input.setAttribute('aria-describedby', aviso.id);

    col.append(label, input, aviso);
    return { col, input };
}

/** Marca un campo con su problema ('' lo limpia). */
function marcarCampo(id, problema) {
    const campo = $(id);
    if (!campo) return;
    campo.classList.toggle('is-invalid', Boolean(problema));
    const aviso = $(`${id}-error`);
    if (aviso) aviso.textContent = problema;
}

function dibujarPasajeros() {
    listaPasajeros.replaceChildren();

    if (seleccionados.length === 0) {
        listaPasajeros.appendChild(textoSuave('Elige al menos un asiento.'));
        return;
    }

    seleccionados.forEach((numero) => {
        const d = datos.get(numero);

        const tarjeta = document.createElement('div');
        tarjeta.className = 'border rounded p-3 mb-3';

        const titulo = document.createElement('h3');
        titulo.className = 'h6 mb-3';
        titulo.textContent = `Asiento ${numero}`;

        const fila = document.createElement('div');
        fila.className = 'row g-2';

        const cedula = crearCampo('Cédula *', `cedula-${numero}`, d.cedula,
            { maxLength: 10, inputMode: 'numeric', autocomplete: 'off' });
        const nombres = crearCampo('Nombres *', `nombres-${numero}`, d.nombres, { autocomplete: 'off' });
        const apellidos = crearCampo('Apellidos *', `apellidos-${numero}`, d.apellidos, { autocomplete: 'off' });

        const colTipo = document.createElement('div');
        colTipo.className = 'col-md-6';
        const labelTipo = document.createElement('label');
        labelTipo.className = 'form-label small mb-1';
        labelTipo.htmlFor = `tipo-${numero}`;
        labelTipo.textContent = 'Tipo de pasajero *';
        const selectTipo = document.createElement('select');
        selectTipo.className = 'form-select form-select-sm';
        selectTipo.id = `tipo-${numero}`;
        // "Adulto" (normal) por defecto: no lleva opción "Selecciona...".
        ponerOpciones(selectTipo, tipos, {
            valor: (t) => t.codigo,
            texto: (t) => (t.descuento > 0 ? `${t.nombre} (${Number(t.descuento)}% desc.)` : t.nombre),
            inicial: null,
            porDefecto: d.tipo || 'normal',
            vacio: 'No hay tipos de pasajero'
        });
        colTipo.append(labelTipo, selectTipo);

        cedula.input.addEventListener('input', () => {
            cedula.input.value = cedula.input.value.replace(/\D/g, '');
            d.cedula = cedula.input.value;
            cedula.input.classList.remove('is-invalid');
        });
        cedula.input.addEventListener('blur', () => buscarPasajero(numero));
        nombres.input.addEventListener('input', () => { d.nombres = nombres.input.value; nombres.input.classList.remove('is-invalid'); });
        apellidos.input.addEventListener('input', () => { d.apellidos = apellidos.input.value; apellidos.input.classList.remove('is-invalid'); });
        selectTipo.addEventListener('change', () => { d.tipo = selectTipo.value; actualizarResumen(); });

        fila.append(cedula.col, colTipo, nombres.col, apellidos.col);
        tarjeta.append(titulo, fila);
        listaPasajeros.appendChild(tarjeta);
    });

    const nota = document.createElement('p');
    nota.className = 'small text-muted mb-0';
    nota.textContent = '* Campo obligatorio. Si un niño no tiene cédula, usa la de su representante.';
    listaPasajeros.appendChild(nota);
}

async function buscarPasajero(numero) {
    const d = datos.get(numero);
    if (!d) return;

    const cedula = d.cedula.trim();
    if (!cedulaValida(cedula)) {
        if (cedula !== '') marcarCampo(`cedula-${numero}`, 'La cédula ingresada no es válida.');
        return;
    }
    if (d.nombres.trim() || d.apellidos.trim()) return;

    try {
        const { data, error } = await supabase.rpc('buscar_pasajero', { p_cedula: cedula });
        if (error || !data) return;

        if (d.nombres.trim() || d.apellidos.trim()) return;

        d.nombres = data.nombres;
        d.apellidos = data.apellidos;
        if ($(`nombres-${numero}`)) $(`nombres-${numero}`).value = data.nombres;
        if ($(`apellidos-${numero}`)) $(`apellidos-${numero}`).value = data.apellidos;
    } catch (error) {
        console.error('No se pudo buscar el pasajero:', error);
    }
}

/* ---------- Resumen del cobro ---------- */

function resumenActual() {
    return calcularResumen(
        viaje.precio,
        seleccionados.map((numero) => ({ numero_asiento: numero, tipo: datos.get(numero).tipo })),
        tipos
    );
}

function filaResumen(texto, valor, clase = '') {
    const tr = document.createElement('tr');
    if (clase) tr.className = clase;
    const tdValor = celda(valor);
    tdValor.className = 'text-end';
    tr.append(celda(texto), tdValor);
    return tr;
}

function actualizarResumen() {
    resumenCobro.replaceChildren();
    btnConfirmar.disabled = seleccionados.length === 0;

    if (seleccionados.length === 0) {
        const tr = document.createElement('tr');
        tr.appendChild(celda('Sin asientos elegidos.'));
        tr.firstChild.className = 'text-muted';
        resumenCobro.appendChild(tr);
        return;
    }

    const resumen = resumenActual();

    resumen.lineas.forEach((l) => {
        const detalle = l.descuento > 0 ? ` (−${l.descuento}%)` : '';
        resumenCobro.appendChild(filaResumen(`Asiento ${l.numero_asiento} · ${l.tarifa}${detalle}`, dinero(l.precio)));
    });

    resumenCobro.appendChild(filaResumen(`Subtotal (tarifa normal ${dinero(precioConDescuento(viaje.precio))} c/u)`,
        dinero(resumen.subtotal), 'border-top'));
    resumenCobro.appendChild(filaResumen('Descuentos', resumen.descuento > 0 ? `−${dinero(resumen.descuento)}` : dinero(0)));
    resumenCobro.appendChild(filaResumen('Total a cobrar en efectivo', dinero(resumen.total), 'table-light fw-bold'));
}

/* ---------- Confirmar la venta ---------- */

function validarPasajeros() {
    let primerError = null;

    seleccionados.forEach((numero) => {
        const errores = revisarPasajero(datos.get(numero));

        ['cedula', 'nombres', 'apellidos'].forEach((campo) => {
            const id = `${campo}-${numero}`;
            marcarCampo(id, errores[campo] ?? '');
            if (errores[campo] && !primerError) primerError = $(id);
        });
    });

    primerError?.focus();
    return !primerError;
}

let vendiendo = false;

btnConfirmar.addEventListener('click', async () => {
    if (vendiendo || seleccionados.length === 0 || !validarPasajeros()) return;

    const { total } = resumenActual();
    if (!confirm(`¿Cobrar ${dinero(total)} en efectivo y emitir ${seleccionados.length} boleto(s)?`)) return;

    const textoOriginal = btnConfirmar.textContent;
    vendiendo = true;
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = 'Procesando...';

    try {
        const pasajeros = seleccionados.map((numero) => pasajeroParaEnviar(numero, datos.get(numero)));

        const { data, error } = await supabase.rpc('vender_en_oficina', {
            p_viaje_id: viaje.id,
            p_pasajeros: pasajeros
        });

        if (error) throw error;
        mostrarResultado(data);
    } catch (error) {
        console.error('Error al registrar la venta:', error);
        mostrarAlerta(textoError(error), 'danger');

        try {
            await actualizarOcupados();
            pintarAsientos();
            dibujarPasajeros();
            actualizarResumen();
        } catch (_) { }
    } finally {
        vendiendo = false;
        btnConfirmar.textContent = textoOriginal;
        btnConfirmar.disabled = seleccionados.length === 0;
    }
});

/* ======================================================================
   PASO 3: boletos emitidos
   ====================================================================== */

function mostrarResultado(venta) {
    paso2.classList.add('d-none');
    resultado.classList.remove('d-none');
    $('totalCobrado').textContent = dinero(venta.total);

    const contenedor = $('boletos');
    contenedor.replaceChildren();

    const datosViaje = {
        origen: viaje.frecuencias.origen,
        destino: viaje.frecuencias.destino,
        fecha: viaje.fecha,
        hora: viaje.frecuencias.hora,
        bus: textoBus(viaje.buses),
        cooperativa: cooperativas.find((c) => c.id === viaje.buses.cooperativa_id)?.nombre ?? ''
    };

    venta.boletos.forEach((b) => {
        contenedor.appendChild(crearBoletoImpreso(datosBoleto(b, datosViaje, { tipos, origen: 'OFICINA' })));
    });

    resultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('btnImprimir').addEventListener('click', () => window.print());

function nuevaVenta() {
    resultado.classList.add('d-none');
    paso2.classList.add('d-none');
    paso1.classList.remove('d-none');
    viaje = null;
    seleccionados = [];
    datos.clear();

    cargarViajes().catch((error) => mostrarAlerta(textoError(error), 'danger'));
}

$('btnNuevaVenta').addEventListener('click', nuevaVenta);

$('btnVolverViajes').addEventListener('click', () => {
    if (seleccionados.length > 0 && !confirm('Se perderán los asientos y datos ingresados. ¿Continuar?')) return;
    nuevaVenta();
});

/* ======================================================================
   Inicio
   ====================================================================== */

async function iniciar() {
    const rol = await exigirRoles(['oficinista']);
    if (!rol) return;

    const hoy = fechaHoyEcuador();
    $('filtroFecha').min = hoy;
    $('filtroFecha').max = sumarDias(hoy, DIAS_VISIBLES);
    $('filtroFecha').value = hoy; // punto de venta: los viajes del día

    try {
        const contexto = await obtenerContextoGestion();
        cooperativas = contexto.cooperativas;

        if (cooperativas.length === 0) {
            filaInformativa('Tu cuenta aún no está asignada a una cooperativa. Contacta al administrador.', 'text-danger');
            return;
        }

        const { data, error } = await supabase
            .from('tipos_pasajero')
            .select('codigo, nombre, descuento, activo')
            .order('descuento', { ascending: true });

        if (error) throw error;
        // Solo las tarifas activas (la base rechaza las demás).
        tipos = (data ?? []).filter((t) => t.activo !== false);

        await cargarViajes();
    } catch (error) {
        console.error('Error al iniciar la venta:', error);
        filaInformativa('No se pudieron cargar los viajes.', 'text-danger');
        mostrarAlerta(textoError(error), 'danger');
    }
}

iniciar();
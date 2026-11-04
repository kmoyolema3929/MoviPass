import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { obtenerContextoGestion, textoError } from '../../js/contextoUsuario.js';
import { mostrarAlerta } from '../../js/alertas.js';
import {
    cedulaValida, fechaLocalISO, sumarDias, formatearFecha, formatearHora, dinero
} from '../../js/validaciones.js'; // <-- Ruta corregida

const MAX_ASIENTOS = 10;
const DIAS_VISIBLES = 15;

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
    const hoy = fechaLocalISO();

    const { data, error } = await supabase
        .from('viajes')
        .select(`
            id, fecha, precio, bus_id,
            frecuencias!inner ( origen, destino, hora, activa ),
            buses!inner ( placa, tipo_bus, cooperativa_id ),
            hojas_ruta ( estado )
        `)
        .in('buses.cooperativa_id', cooperativas.map((c) => c.id))
        .eq('frecuencias.activa', true)
        .gte('fecha', hoy)
        .lte('fecha', sumarDias(hoy, DIAS_VISIBLES))
        .order('fecha', { ascending: true });

    if (error) throw error;

    const ahora = new Date();
    const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

    viajes = (data ?? [])
        .filter((v) => !v.hojas_ruta || v.hojas_ruta.estado === 'Programado')
        .filter((v) => v.fecha !== hoy || formatearHora(v.frecuencias.hora) > horaActual)
        .sort((a, b) =>
            a.fecha.localeCompare(b.fecha) ||
            String(a.frecuencias.hora).localeCompare(String(b.frecuencias.hora)));

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
        filaInformativa('No hay viajes disponibles con esos filtros.');
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
            celda(`${v.buses.placa} · ${v.buses.tipo_bus}`),
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
    $('filtroFecha').value = '';
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
        `${formatearHora(v.frecuencias.hora)} · Bus ${v.buses.placa} · Precio base ${dinero(v.precio)}`;

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
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'asiento' + (asiento.tipo === 'vip' ? ' vip' : '');
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

        const maxColumna = Math.max(...delPiso.map((a) => a.columna));
        const conPasillo = maxColumna === 4;
        const porPosicion = new Map(delPiso.map((a) => [`${a.fila}-${a.columna}`, a]));
        const filas = [...new Set(delPiso.map((a) => a.fila))].sort((x, y) => x - y);

        const grid = document.createElement('div');
        grid.className = 'asientos-grid';
        grid.style.gridTemplateColumns = conPasillo ? '44px 44px 20px 44px 44px' : `repeat(${maxColumna}, 44px)`;

        filas.forEach((fila) => {
            for (let col = 1; col <= maxColumna; col++) {
                if (conPasillo && col === 3) {
                    grid.appendChild(document.createElement('div'));
                }
                const asiento = porPosicion.get(`${fila}-${col}`);
                grid.appendChild(asiento ? crearBotonAsiento(asiento) : document.createElement('div'));
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
    if (atributos.maxLength) input.maxLength = atributos.maxLength;
    if (atributos.inputMode) input.inputMode = atributos.inputMode;
    if (atributos.autocomplete) input.autocomplete = atributos.autocomplete;

    col.append(label, input);
    return { col, input };
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

        const cedula = crearCampo('Cédula', `cedula-${numero}`, d.cedula,
            { maxLength: 10, inputMode: 'numeric', autocomplete: 'off' });
        const nombres = crearCampo('Nombres', `nombres-${numero}`, d.nombres, { autocomplete: 'off' });
        const apellidos = crearCampo('Apellidos', `apellidos-${numero}`, d.apellidos, { autocomplete: 'off' });

        const colTipo = document.createElement('div');
        colTipo.className = 'col-md-6';
        const labelTipo = document.createElement('label');
        labelTipo.className = 'form-label small mb-1';
        labelTipo.htmlFor = `tipo-${numero}`;
        labelTipo.textContent = 'Tipo de pasajero';
        const selectTipo = document.createElement('select');
        selectTipo.className = 'form-select form-select-sm';
        selectTipo.id = `tipo-${numero}`;
        tipos.forEach((t) => {
            const op = document.createElement('option');
            op.value = t.codigo;
            op.textContent = t.descuento > 0 ? `${t.nombre} (${Number(t.descuento)}% desc.)` : t.nombre;
            selectTipo.appendChild(op);
        });
        selectTipo.value = d.tipo;
        colTipo.append(labelTipo, selectTipo);

        const ayuda = document.createElement('div');
        ayuda.className = 'invalid-feedback';
        ayuda.textContent = 'Cédula no válida (10 dígitos).';
        cedula.col.appendChild(ayuda);

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
    nota.textContent = 'Si un niño no tiene cédula, usa la de su representante.';
    listaPasajeros.appendChild(nota);
}

async function buscarPasajero(numero) {
    const d = datos.get(numero);
    if (!d) return;

    const cedula = d.cedula.trim();
    if (!cedulaValida(cedula)) {
        if (cedula !== '') $(`cedula-${numero}`)?.classList.add('is-invalid');
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

function precioConDescuento(tipoCodigo) {
    const tipo = tipos.find((t) => t.codigo === tipoCodigo);
    const descuento = tipo ? Number(tipo.descuento) : 0;
    return Math.round(Number(viaje.precio) * (100 - descuento)) / 100;
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

    let total = 0;

    seleccionados.forEach((numero) => {
        const d = datos.get(numero);
        const precio = precioConDescuento(d.tipo);
        total += precio;

        const tipo = tipos.find((t) => t.codigo === d.tipo);
        const tr = document.createElement('tr');
        const tdPrecio = celda(dinero(precio));
        tdPrecio.className = 'text-end';
        tr.append(celda(`Asiento ${numero} · ${tipo ? tipo.nombre : d.tipo}`), tdPrecio);
        resumenCobro.appendChild(tr);
    });

    const trTotal = document.createElement('tr');
    trTotal.className = 'table-light fw-bold';
    const tdTotal = celda(dinero(total));
    tdTotal.className = 'text-end';
    trTotal.append(celda('Total a cobrar'), tdTotal);
    resumenCobro.appendChild(trTotal);
}

/* ---------- Confirmar la venta ---------- */

function validarPasajeros() {
    let primerError = null;

    seleccionados.forEach((numero) => {
        const d = datos.get(numero);
        const revisar = (ok, id) => {
            const campo = $(id);
            campo.classList.toggle('is-invalid', !ok);
            if (!ok && !primerError) primerError = campo;
        };

        revisar(cedulaValida(d.cedula.trim()), `cedula-${numero}`);
        revisar(d.nombres.trim().length >= 2, `nombres-${numero}`);
        revisar(d.apellidos.trim().length >= 2, `apellidos-${numero}`);
    });

    if (primerError) {
        primerError.focus();
        mostrarAlerta('Revisa los datos marcados en rojo.', 'warning');
        return false;
    }
    return true;
}

btnConfirmar.addEventListener('click', async () => {
    if (seleccionados.length === 0 || !validarPasajeros()) return;

    const total = seleccionados.reduce((suma, n) => suma + precioConDescuento(datos.get(n).tipo), 0);
    if (!confirm(`¿Cobrar ${dinero(total)} en efectivo y emitir ${seleccionados.length} boleto(s)?`)) return;

    const textoOriginal = btnConfirmar.textContent;
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = 'Procesando...';

    try {
        const pasajeros = seleccionados.map((numero) => {
            const d = datos.get(numero);
            return {
                numero_asiento: numero,
                cedula: d.cedula.trim(),
                nombres: d.nombres.trim(),
                apellidos: d.apellidos.trim(),
                tipo: d.tipo
            };
        });

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

    const tipoNombre = (codigo) => tipos.find((t) => t.codigo === codigo)?.nombre ?? codigo;

    venta.boletos.forEach((b) => {
        const caja = document.createElement('div');
        caja.className = 'boleto';

        const fila1 = document.createElement('div');
        fila1.className = 'd-flex justify-content-between align-items-start flex-wrap gap-2';

        const info = document.createElement('div');
        const ruta = document.createElement('div');
        ruta.className = 'h5 mb-1';
        ruta.textContent = `${viaje.frecuencias.origen} → ${viaje.frecuencias.destino}`;
        const detalle = document.createElement('div');
        detalle.className = 'text-muted';
        detalle.textContent =
            `${formatearFecha(viaje.fecha)} · ${formatearHora(viaje.frecuencias.hora)} · Bus ${viaje.buses.placa}`;
        info.append(ruta, detalle);

        const asiento = document.createElement('div');
        asiento.className = 'text-end';
        const etiqueta = document.createElement('div');
        etiqueta.className = 'small text-muted';
        etiqueta.textContent = 'Asiento';
        const numero = document.createElement('div');
        numero.className = 'display-6 fw-bold';
        numero.textContent = b.numero_asiento;
        asiento.append(etiqueta, numero);

        fila1.append(info, asiento);

        const pasajero = document.createElement('div');
        pasajero.className = 'mt-2';
        pasajero.textContent =
            `${b.pasajero} · C.I. ${b.cedula} · ${tipoNombre(b.tipo)} · ${dinero(b.precio)}`;

        const codigo = document.createElement('div');
        codigo.className = 'codigo mt-2';
        codigo.textContent = b.codigo;

        caja.append(fila1, pasajero, codigo);
        contenedor.appendChild(caja);
    });
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

    $('filtroFecha').min = fechaLocalISO();

    try {
        const contexto = await obtenerContextoGestion();
        cooperativas = contexto.cooperativas;

        if (cooperativas.length === 0) {
            filaInformativa('Tu cuenta aún no está asignada a una cooperativa. Contacta al administrador.', 'text-danger');
            return;
        }

        const { data, error } = await supabase
            .from('tipos_pasajero')
            .select('codigo, nombre, descuento')
            .order('descuento', { ascending: true });

        if (error) throw error;
        tipos = data ?? [];

        await cargarViajes();
    } catch (error) {
        console.error('Error al iniciar la venta:', error);
        filaInformativa('No se pudieron cargar los viajes.', 'text-danger');
        mostrarAlerta(textoError(error), 'danger');
    }
}

iniciar();
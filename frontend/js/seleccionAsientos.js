import { supabase } from './supabaseClient.js';
import { exigirRoles } from './guardas.js';
import { mostrarAlerta } from './alertas.js';
import { dinero, formatearFecha, formatearHora } from './validaciones.js';
import { leerViajeId, urlResumenCompra } from './rutasCompra.js';
import { obtenerCeldasEspecialesDeBus } from './asientosService.js';
import { claseTipoAsiento, columnasDelMapa, crearAsientoBloqueado, crearCeldaEspecial } from './celdasEspeciales.js';
import { mensajeErrorBase } from './erroresBase.js';
import { fechaHoyEcuador } from './combos.js';
import { limpiarAlEscribir, mostrarErrores } from './formularios.js';
import {
    MAX_ASIENTOS_COMPRA, ajustarSeleccion, revisarCantidadAsientos, textoSeleccionAsientos
} from './reglasCompra.js';
import { horaEcuador, textoBus, viajesVendibles } from './reglasOperacion.js';

// Cambio 4, parte 4.2: el cliente indica cuántos asientos necesita y los elige en el mapa.
const MAX_ASIENTOS = MAX_ASIENTOS_COMPRA;
const $ = (id) => document.getElementById(id);

let viaje = null;
let asientos = [];
let especiales = new Map(); // baño por piso: se muestra bloqueado
let tipos = [];
let ocupados = new Set();
let seleccionados = [];
let cantidad = 1;      // número de asientos que indicó el cliente
let cerrado = '';      // motivo por el que el viaje ya no se vende ('' si se vende)
const botonesAsiento = new Map();

function textoSuave(texto, clase = 'text-muted') {
    const p = document.createElement('p');
    p.className = `${clase} text-center mb-0`;
    p.textContent = texto;
    return p;
}

async function cargarViaje(viajeId) {
    const { data, error } = await supabase
        .from('viajes')
        .select(`
            id, fecha, precio, bus_id, estado_operativo,
            frecuencia:frecuencias ( origen, destino, hora ),
            hoja:hojas_ruta ( estado ),
            bus:buses (
                placa,
                numero_interno,
                tipo_bus,
                cooperativa:cooperativas ( nombre )
            )
        `)
        .eq('id', viajeId)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('El viaje no existe o ya no está disponible.');

    if (!data.frecuencia || !data.bus) {
        throw new Error('No se pudieron cargar los datos del viaje. Inténtalo de nuevo.');
    }

    viaje = {
        id: data.id,
        fecha: data.fecha,
        precio: Number(data.precio),
        hora: data.frecuencia.hora,
        origen: data.frecuencia.origen,
        destino: data.frecuencia.destino,
        busId: data.bus_id,
        busPlaca: data.bus.placa,
        busNumero: data.bus.numero_interno ?? '',
        tipoBus: data.bus.tipo_bus,
        cooperativaNombre: data.bus.cooperativa?.nombre ?? 'Cooperativa',
    };

    // Fecha y hora de Ecuador: un viaje que ya salió, en curso o finalizado no se vende.
    const vendible = viajesVendibles([{
        fecha: data.fecha,
        estado_operativo: data.estado_operativo,
        hojas_ruta: data.hoja ?? null,
        frecuencias: { hora: data.frecuencia.hora },
    }], fechaHoyEcuador(), horaEcuador()).length > 0;

    cerrado = vendible ? '' : 'Este viaje ya salió o ya no está a la venta. Busca otro horario.';

    $('rutaViaje').textContent = `${viaje.origen} → ${viaje.destino}`;
    $('detalleViaje').textContent =
        `${formatearFecha(viaje.fecha)} · ${formatearHora(viaje.hora)} · ${viaje.tipoBus}`;
    $('infoCooperativa').textContent =
        `${viaje.cooperativaNombre} · Bus ${textoBus({ numero_interno: viaje.busNumero, placa: viaje.busPlaca })}`;
    $('precioUnitario').textContent = dinero(viaje.precio);
}

async function cargarTipos() {
    const { data, error } = await supabase
        .from('tipos_pasajero')
        .select('codigo, nombre, descuento, activo')
        .order('descuento', { ascending: true });

    if (error) throw error;
    // Solo las tarifas activas (la base rechaza las demás).
    tipos = (data ?? []).filter((t) => t.activo !== false);
}

async function cargarAsientos() {
    const { data, error } = await supabase
        .from('asientos')
        .select('numero, piso, fila, columna, tipo')
        .eq('bus_id', viaje.busId)
        .order('numero', { ascending: true });

    if (error) throw error;
    asientos = data ?? [];

    // El baño no es un asiento: solo se dibuja. Si no se puede leer, el mapa sigue
    // funcionando sin él (la base igual rechaza vender esa posición).
    try {
        especiales = await obtenerCeldasEspecialesDeBus(viaje.busId);
    } catch (errorEspeciales) {
        console.warn('No se pudo cargar el baño del bus:', errorEspeciales);
        especiales = new Map();
    }
}

async function actualizarOcupados() {
    const { data, error } = await supabase.rpc('asientos_ocupados', {
        p_viaje_id: viaje.id,
    });

    if (error) throw error;

    ocupados = new Set((data ?? []).map(Number));

    const antes = seleccionados.length;
    seleccionados = seleccionados.filter((numero) => !ocupados.has(numero));

    if (seleccionados.length !== antes) {
        mostrarAlerta('Algún asiento que elegiste ya fue ocupado y se quitó de tu selección.', 'warning');
    }
}

/** Asientos que todavía se pueden comprar (ni bloqueados ni ocupados). */
function asientosLibres() {
    return asientos.filter((a) => a.tipo !== 'bloqueado' && !ocupados.has(Number(a.numero))).length;
}

/** Revisa el número de asientos; si está bien lo aplica a la selección. */
function aplicarCantidad({ avisar = true } = {}) {
    const form = $('formCantidad');
    const campo = $('cantidadAsientos');
    const problema = revisarCantidadAsientos(campo.value, asientosLibres());

    if (!mostrarErrores(form, { cantidad: problema })) {
        cantidad = 0;
        actualizarResumen();
        return false;
    }

    cantidad = Number(campo.value);
    const { seleccion, quitados } = ajustarSeleccion(seleccionados, cantidad);
    seleccionados = seleccion;

    if (avisar && quitados.length > 0) {
        mostrarAlerta(`Se quitó de tu selección: asiento ${quitados.join(', ')}.`, 'info');
    }

    pintarAsientos();
    actualizarResumen();
    return true;
}

function crearBotonAsiento(asiento) {
    // Bloqueado: se ve, pero nunca se puede elegir.
    if (asiento.tipo === 'bloqueado') return crearAsientoBloqueado(asiento, 'asiento-cliente bloqueado');

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'asiento-cliente' + claseTipoAsiento(asiento.tipo);
    boton.textContent = asiento.numero;
    boton.dataset.numero = asiento.numero;
    boton.setAttribute('aria-label', `Asiento ${asiento.numero}`);
    boton.addEventListener('click', () => alternarAsiento(Number(asiento.numero)));
    botonesAsiento.set(Number(asiento.numero), boton);
    return boton;
}

function dibujarMapa() {
    const mapa = $('mapaAsientos');
    mapa.replaceChildren();
    botonesAsiento.clear();

    if (asientos.length === 0) {
        mapa.appendChild(textoSuave('Este bus todavía no tiene asientos configurados.', 'text-danger'));
        return;
    }

    const pisos = [...new Set(asientos.map((a) => Number(a.piso ?? 1)))].sort((a, b) => a - b);

    pisos.forEach((piso) => {
        const delPiso = asientos.filter((a) => Number(a.piso ?? 1) === piso);

        if (pisos.length > 1) {
            const titulo = document.createElement('h3');
            titulo.className = 'h6 text-center text-muted mt-3 mb-2';
            titulo.textContent = `Piso ${piso}`;
            mapa.appendChild(titulo);
        }

        const conPosicion = delPiso.every((a) => a.fila != null && a.columna != null);

        if (!conPosicion) {
            const contenedor = document.createElement('div');
            contenedor.className = 'asientos-libres';
            delPiso
                .sort((a, b) => Number(a.numero) - Number(b.numero))
                .forEach((a) => contenedor.appendChild(crearBotonAsiento(a)));
            mapa.appendChild(contenedor);
            return;
        }

        const especialesPiso = especiales.get(piso) ?? [];
        const maxColumna = Math.max(
            ...delPiso.map((a) => Number(a.columna)),
            ...especialesPiso.map((c) => c.columna)
        );
        const porPosicion = new Map(
            delPiso.map((a) => [`${a.fila}-${a.columna}`, a])
        );
        const especialPorPosicion = new Map(
            especialesPiso.map((c) => [`${c.fila}-${c.columna}`, c])
        );
        const filas = [...new Set([
            ...delPiso.map((a) => Number(a.fila)),
            ...especialesPiso.map((c) => c.fila)
        ])].sort((a, b) => a - b);

        const grid = document.createElement('div');
        grid.className = 'asientos-grid';
        // El pasillo viene en la plantilla (cambio 6): las columnas de solo pasillo son angostas.
        grid.style.gridTemplateColumns = columnasDelMapa(maxColumna, filas, especialesPiso, '48px', '24px');

        filas.forEach((fila) => {
            for (let columna = 1; columna <= maxColumna; columna++) {
                const asiento = porPosicion.get(`${fila}-${columna}`);
                const especial = especialPorPosicion.get(`${fila}-${columna}`);
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
        boton.title = ocupado
            ? `Asiento ${numero} (ocupado)`
            : `Asiento ${numero}`;
    });
}

function alternarAsiento(numero) {
    if (ocupados.has(numero) || cerrado) return;

    if (seleccionados.includes(numero)) {
        seleccionados = seleccionados.filter((n) => n !== numero);
    } else {
        if (!cantidad) {
            $('cantidadAsientos').focus();
            aplicarCantidad();
            return;
        }
        if (seleccionados.length >= Math.min(cantidad, MAX_ASIENTOS)) {
            mostrarAlerta(
                `Ya elegiste ${cantidad} asiento${cantidad === 1 ? '' : 's'}. Quita uno o sube el número de asientos.`,
                'warning'
            );
            return;
        }

        seleccionados = [...seleccionados, numero].sort((a, b) => a - b);
    }

    pintarAsientos();
    actualizarResumen();
}

function actualizarResumen() {
    const lista = $('listaSeleccion');
    lista.replaceChildren();

    $('sinSeleccion').classList.toggle('d-none', seleccionados.length > 0);
    $('cantidad').textContent = String(seleccionados.length);
    $('total').textContent = dinero(seleccionados.length * viaje.precio);
    $('btnContinuar').disabled = Boolean(cerrado) || !cantidad || seleccionados.length !== cantidad;
    $('btnLimpiar').disabled = seleccionados.length === 0;
    $('estadoSeleccion').textContent = cerrado || textoSeleccionAsientos(cantidad, seleccionados.length);

    seleccionados.forEach((numero) => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between px-0';

        const asiento = document.createElement('span');
        asiento.textContent = `Asiento ${numero}`;

        const precio = document.createElement('span');
        precio.textContent = `Tarifa normal ${dinero(viaje.precio)}`;

        li.append(asiento, precio);
        lista.appendChild(li);
    });
}

$('btnLimpiar').addEventListener('click', () => {
    seleccionados = [];
    pintarAsientos();
    actualizarResumen();
});

$('btnActualizarMapa').addEventListener('click', async () => {
    try {
        await actualizarOcupados();
        pintarAsientos();
        aplicarCantidad({ avisar: false });
    } catch (error) {
        console.error('No se pudo actualizar el mapa:', error);
        mostrarAlerta('No se pudo actualizar la disponibilidad de asientos.', 'danger');
    }
});

$('formCantidad').addEventListener('submit', (evento) => {
    evento.preventDefault();
    aplicarCantidad();
});
limpiarAlEscribir($('formCantidad'));
// "change" (flechas, Enter o al salir del campo): mientras escribe "10" no se
// recorta la selección al pasar por "1".
$('cantidadAsientos').addEventListener('change', () => aplicarCantidad());

$('btnContinuar').addEventListener('click', () => {
    if (cerrado || !aplicarCantidad({ avisar: false })) return;
    if (seleccionados.length !== cantidad) {
        mostrarAlerta(textoSeleccionAsientos(cantidad, seleccionados.length), 'warning');
        return;
    }

    const borrador = {
        viaje: {
            id: viaje.id,
            fecha: viaje.fecha,
            precio: viaje.precio,
            hora: viaje.hora,
            origen: viaje.origen,
            destino: viaje.destino,
            busId: viaje.busId,
            busPlaca: viaje.busPlaca,
            busNumero: viaje.busNumero,
            tipoBus: viaje.tipoBus,
            cooperativaNombre: viaje.cooperativaNombre,
        },
        asientos: [...seleccionados],
        tipos,
    };

    sessionStorage.setItem('compraDraft', JSON.stringify(borrador));

    window.location.href = urlResumenCompra(viaje.id);
});

async function iniciar() {
    const rol = await exigirRoles(['cliente']);
    if (!rol) return;

    const viajeId = leerViajeId(window.location.search);

    if (!viajeId) {
        $('mapaAsientos').replaceChildren(
            textoSuave('No se indicó un viaje. Vuelve a buscar tu viaje.', 'text-danger')
        );
        $('btnContinuar').disabled = true;
        return;
    }

    try {
        await cargarViaje(viajeId);
        await Promise.all([cargarAsientos(), cargarTipos()]);
        await actualizarOcupados();
        dibujarMapa();

        if (cerrado) {
            mostrarAlerta(cerrado, 'warning');
            $('cantidadAsientos').disabled = true;
        }
        aplicarCantidad({ avisar: false });
    } catch (error) {
        console.error('No se pudo cargar la selección de asientos:', error);
        $('mapaAsientos').replaceChildren(
            textoSuave('No se pudieron cargar los asientos de este viaje.', 'text-danger')
        );
        $('btnContinuar').disabled = true;
        mostrarAlerta(mensajeErrorBase(error, 'cargar el viaje'), 'danger');
    }
}

iniciar();

import { supabase } from './supabaseClient.js';
import { exigirRoles } from './guardas.js';
import { mostrarAlerta } from './alertas.js';
import { dinero, formatearFecha, formatearHora } from './validaciones.js';

const MAX_ASIENTOS = 10;
const $ = (id) => document.getElementById(id);

let viaje = null;
let asientos = [];
let tipos = [];
let ocupados = new Set();
let seleccionados = [];
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
            id, fecha, precio, bus_id,
            frecuencia:frecuencias ( origen, destino, hora ),
            bus:buses (
                placa,
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
        tipoBus: data.bus.tipo_bus,
        cooperativaNombre: data.bus.cooperativa?.nombre ?? 'Cooperativa',
    };

    $('rutaViaje').textContent = `${viaje.origen} → ${viaje.destino}`;
    $('detalleViaje').textContent =
        `${formatearFecha(viaje.fecha)} · ${formatearHora(viaje.hora)} · ${viaje.tipoBus}`;
    $('infoCooperativa').textContent =
        `${viaje.cooperativaNombre} · Bus ${viaje.busPlaca}`;
    $('precioUnitario').textContent = dinero(viaje.precio);
}

async function cargarTipos() {
    const { data, error } = await supabase
        .from('tipos_pasajero')
        .select('codigo, nombre, descuento')
        .order('descuento', { ascending: true });

    if (error) throw error;
    tipos = data ?? [];
}

async function cargarAsientos() {
    const { data, error } = await supabase
        .from('asientos')
        .select('numero, piso, fila, columna, tipo')
        .eq('bus_id', viaje.busId)
        .order('numero', { ascending: true });

    if (error) throw error;
    asientos = data ?? [];
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

function crearBotonAsiento(asiento) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'asiento-cliente' + (asiento.tipo === 'vip' ? ' vip' : '');
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

        const maxColumna = Math.max(...delPiso.map((a) => Number(a.columna)));
        const conPasillo = maxColumna === 4;
        const porPosicion = new Map(
            delPiso.map((a) => [`${a.fila}-${a.columna}`, a])
        );
        const filas = [...new Set(delPiso.map((a) => Number(a.fila)))].sort((a, b) => a - b);

        const grid = document.createElement('div');
        grid.className = 'asientos-grid';
        grid.style.gridTemplateColumns = conPasillo
            ? '48px 48px 24px 48px 48px'
            : `repeat(${maxColumna}, 48px)`;

        filas.forEach((fila) => {
            for (let columna = 1; columna <= maxColumna; columna++) {
                if (conPasillo && columna === 3) {
                    grid.appendChild(document.createElement('div'));
                }

                const asiento = porPosicion.get(`${fila}-${columna}`);
                grid.appendChild(
                    asiento ? crearBotonAsiento(asiento) : document.createElement('div')
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
    if (ocupados.has(numero)) return;

    if (seleccionados.includes(numero)) {
        seleccionados = seleccionados.filter((n) => n !== numero);
    } else {
        if (seleccionados.length >= MAX_ASIENTOS) {
            mostrarAlerta(`Puedes elegir como máximo ${MAX_ASIENTOS} asientos por compra.`, 'warning');
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
    $('btnContinuar').disabled = seleccionados.length === 0;
    $('btnLimpiar').disabled = seleccionados.length === 0;

    seleccionados.forEach((numero) => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between px-0';

        const asiento = document.createElement('span');
        asiento.textContent = `Asiento ${numero}`;

        const precio = document.createElement('span');
        precio.textContent = dinero(viaje.precio);

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
        actualizarResumen();
    } catch (error) {
        console.error('No se pudo actualizar el mapa:', error);
        mostrarAlerta('No se pudo actualizar la disponibilidad de asientos.', 'danger');
    }
});

$('btnContinuar').addEventListener('click', () => {
    if (seleccionados.length === 0) return;

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
            tipoBus: viaje.tipoBus,
            cooperativaNombre: viaje.cooperativaNombre,
        },
        asientos: [...seleccionados],
        tipos,
    };

    sessionStorage.setItem('compraDraft', JSON.stringify(borrador));

    window.location.href = `compra/resumen-compra.html?viaje_id=${encodeURIComponent(viaje.id)}`;
});

async function iniciar() {
    const rol = await exigirRoles(['cliente']);
    if (!rol) return;

    const viajeId = new URLSearchParams(window.location.search).get('viaje_id');

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
        actualizarResumen();
    } catch (error) {
        console.error('No se pudo cargar la selección de asientos:', error);
        $('mapaAsientos').replaceChildren(
            textoSuave('No se pudieron cargar los asientos de este viaje.', 'text-danger')
        );
        $('btnContinuar').disabled = true;
        mostrarAlerta(error.message || 'No se pudo cargar el viaje.', 'danger');
    }
}

iniciar();

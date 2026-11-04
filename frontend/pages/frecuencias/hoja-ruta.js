import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { obtenerContextoGestion, textoError } from '../../js/contextoUsuario.js';
import { mostrarAlerta } from '../../js/alertas.js';

// Debe coincidir con validar_hoja_ruta() en la base de datos.
const DIAS_MAX_ANTICIPACION = 14;

const selCoop = document.getElementById('cooperativa');
const inpInicio = document.getElementById('fechaInicio');
const selDias = document.getElementById('numeroDias');
const btnAuto = document.getElementById('btnAutomatico');
const avisos = document.getElementById('avisos');
const contenedor = document.getElementById('contenedorHoja');

let buses = [];
let tiposConPlantilla = new Set();
let frecuencias = [];
let hojas = [];
let fechas = [];
let hojaPor = new Map();   // "frecuenciaId|fecha" -> hoja
let ocupado = new Map();   // "busId|fecha" -> frecuenciaId

/* ---------- Fechas (siempre como texto AAAA-MM-DD) ---------- */

const pad = (n) => String(n).padStart(2, '0');
const aISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deISO = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
};
const sumarDias = (iso, n) => {
    const d = deISO(iso);
    d.setDate(d.getDate() + n);
    return aISO(d);
};
const numeroDeDia = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
const hoy = () => aISO(new Date());
const limite = () => sumarDias(hoy(), DIAS_MAX_ANTICIPACION);
const horaCorta = (h) => String(h).slice(0, 5);
const clave = (t) => String(t ?? '').trim().toLowerCase();

/* ---------- Utilidades ---------- */

function esElegible(bus) {
    return tiposConPlantilla.has(clave(bus.tipo_bus));
}

function nombreFrecuencia(id) {
    const f = frecuencias.find((x) => x.id === id);
    return f ? `${f.origen} → ${f.destino}` : 'otra frecuencia';
}

function nuevoAviso(clase, texto) {
    const div = document.createElement('div');
    div.className = `alert alert-${clase} mb-3`;
    div.textContent = texto;
    return div;
}

function mensajeDeError(error) {
    const texto = String(error?.message ?? '');

    if (error?.code === '23505') {
        if (texto.includes('hojas_ruta_bus_fecha_unique')) return 'Ese bus ya está asignado a otra frecuencia ese día.';
        if (texto.includes('hojas_ruta_frecuencia_fecha_unique')) return 'Esa frecuencia ya tiene un bus asignado ese día.';
        return 'Ya existe una asignación igual.';
    }
    if (error?.code === '23514') return texto;
    if (error?.code === '23503') return 'No se puede quitar el bus: este viaje ya tiene boletos vendidos.';

    return textoError(error);
}

function indexar() {
    hojaPor = new Map(hojas.map((h) => [`${h.frecuencia_id}|${h.fecha}`, h]));
    ocupado = new Map(hojas.map((h) => [`${h.bus_id}|${h.fecha}`, h.frecuencia_id]));
}

/* ---------- Carga de datos ---------- */

async function cargarCooperativa() {
    buses = [];
    frecuencias = [];
    hojas = [];
    tiposConPlantilla = new Set();
    btnAuto.disabled = true;
    avisos.replaceChildren();

    const coopId = selCoop.value;

    if (!coopId) {
        contenedor.replaceChildren(nuevoAviso('info', 'Selecciona una cooperativa.'));
        return;
    }

    contenedor.replaceChildren(nuevoAviso('info', 'Cargando buses y frecuencias...'));

    try {
        const [rb, rp, rf] = await Promise.all([
            supabase.from('buses').select('id, placa, tipo_bus').eq('cooperativa_id', coopId).order('placa'),
            supabase.from('plantillas_bus').select('tipo_bus').eq('cooperativa_id', coopId),
            supabase
                .from('frecuencias')
                .select('id, origen, destino, hora, tipo, activa, numero_resolucion')
                .eq('cooperativa_id', coopId)
                .order('hora', { ascending: true })
                .order('origen', { ascending: true })
        ]);

        for (const r of [rb, rp, rf]) if (r.error) throw r.error;

        buses = rb.data ?? [];
        tiposConPlantilla = new Set((rp.data ?? []).map((p) => clave(p.tipo_bus)));
        frecuencias = rf.data ?? [];

        await cargarHojas();
    } catch (error) {
        console.error('Error al cargar la hoja de ruta:', error);
        contenedor.replaceChildren(nuevoAviso('danger', 'No se pudieron cargar los datos de la cooperativa.'));
        mostrarAlerta(textoError(error), 'danger');
    }
}

async function cargarHojas() {
    fechas = Array.from({ length: Number(selDias.value) }, (_, i) => sumarDias(inpInicio.value, i));

    if (frecuencias.length === 0) {
        hojas = [];
    } else {
        const { data, error } = await supabase
            .from('hojas_ruta')
            .select('id, frecuencia_id, bus_id, fecha, estado')
            .in('frecuencia_id', frecuencias.map((f) => f.id))
            .gte('fecha', fechas[0])
            .lte('fecha', fechas[fechas.length - 1]);

        if (error) throw error;
        hojas = data ?? [];
    }

    indexar();
    dibujar();
}

async function recargarHojas() {
    if (!selCoop.value) return;
    try {
        await cargarHojas();
    } catch (error) {
        console.error('Error al recargar las hojas:', error);
        mostrarAlerta(textoError(error), 'danger');
    }
}

/* ---------- Dibujo de la cuadrícula ---------- */

function crearSelect(f, fecha, elegibles) {
    const sel = document.createElement('select');
    sel.className = 'form-select form-select-sm';
    sel.setAttribute('aria-label', `Bus para ${f.origen} a ${f.destino} el ${fecha}`);

    const hoja = hojaPor.get(`${f.id}|${fecha}`);

    sel.append(new Option('— sin bus —', ''));

    buses.forEach((b) => {
        const esActual = hoja?.bus_id === b.id;
        if (!esElegible(b) && !esActual) return;

        const usadoEn = ocupado.get(`${b.id}|${fecha}`);
        const op = new Option(`${b.placa} · ${b.tipo_bus}`, b.id);

        if (usadoEn && !esActual) {
            op.disabled = true;
            op.textContent += ` (en ${nombreFrecuencia(usadoEn)})`;
        }
        sel.append(op);
    });

    sel.value = hoja?.bus_id ?? '';

    const pasado = fecha < hoy();
    const lejos = fecha > limite();

    sel.disabled = hoja
        ? !f.activa || pasado || hoja.estado !== 'Programado'
        : !f.activa || pasado || lejos || elegibles.length === 0;

    if (!hoja && lejos) sel.title = `No se permiten hojas con más de ${DIAS_MAX_ANTICIPACION} días de anticipación.`;
    if (hoja && hoja.estado !== 'Programado') sel.title = `Viaje ${hoja.estado.toLowerCase()}.`;

    sel.addEventListener('change', () => cambiarCelda(sel, f, fecha));

    return sel;
}

function dibujar() {
    avisos.replaceChildren();
    contenedor.replaceChildren();

    const elegibles = buses.filter(esElegible);
    const sinPlantilla = buses.filter((b) => !esElegible(b));
    const activas = frecuencias.filter((f) => f.activa);

    btnAuto.disabled = activas.length === 0 || elegibles.length < activas.length;

    if (buses.length === 0) {
        avisos.append(nuevoAviso('warning', 'Esta cooperativa aún no tiene buses. Regístralos en el paso 1 del panel.'));
    } else if (elegibles.length === 0) {
        avisos.append(nuevoAviso('warning', 'Ningún bus tiene plantilla de asientos. Configúrala en el paso 2 del panel.'));
    } else if (sinPlantilla.length > 0) {
        avisos.append(nuevoAviso(
            'warning',
            `Sin plantilla de asientos (no se pueden asignar): ${sinPlantilla.map((b) => b.placa).join(', ')}.`
        ));
    }

    if (activas.length === 0) {
        contenedor.append(nuevoAviso('warning', 'No hay frecuencias activas. Crea o activa una en "Gestionar frecuencias".'));
        return;
    }

    if (elegibles.length > 0 && elegibles.length < activas.length) {
        avisos.append(nuevoAviso(
            'warning',
            `Hay ${activas.length} frecuencias activas y solo ${elegibles.length} buses con asientos: necesitas al menos un bus por frecuencia.`
        ));
    } else if (elegibles.length >= activas.length) {
        const enParada = elegibles.length - activas.length;
        avisos.append(nuevoAviso(
            'info',
            `Con ${elegibles.length} buses y ${activas.length} frecuencias activas, ` +
            `${enParada} ${enParada === 1 ? 'bus queda' : 'buses quedan'} en parada cada día.`
        ));
    }

    // Se muestran las frecuencias activas y las desactivadas que aún tienen hojas en el rango.
    const filas = frecuencias.filter((f) => f.activa || hojas.some((h) => h.frecuencia_id === f.id));

    const tabla = document.createElement('table');
    tabla.className = 'table table-bordered align-middle mb-0 hoja-ruta';

    const thead = document.createElement('thead');
    thead.className = 'table-dark';
    const trHead = document.createElement('tr');

    const thFrec = document.createElement('th');
    thFrec.scope = 'col';
    thFrec.textContent = 'Frecuencia';
    trHead.append(thFrec);

    fechas.forEach((fecha) => {
        const th = document.createElement('th');
        th.scope = 'col';
        th.className = 'text-center text-nowrap';
        th.textContent = deISO(fecha).toLocaleDateString('es-EC', { weekday: 'short', day: '2-digit', month: '2-digit' });
        if (fecha < hoy()) th.title = 'Día pasado';
        trHead.append(th);
    });
    thead.append(trHead);

    const tbody = document.createElement('tbody');

    filas.forEach((f) => {
        const tr = document.createElement('tr');
        if (!f.activa) tr.className = 'table-secondary';

        const th = document.createElement('th');
        th.scope = 'row';
        th.className = 'fw-normal';
        const titulo = document.createElement('strong');
        titulo.textContent = `${f.origen} → ${f.destino}`;
        const detalle = document.createElement('div');
        detalle.className = 'small text-muted';
        detalle.textContent =
            `${horaCorta(f.hora)} · ${f.tipo === 'compartida' ? 'Compartida' : 'Directa'}` +
            (f.activa ? '' : ' · desactivada');
        th.append(titulo, detalle);
        tr.append(th);

        fechas.forEach((fecha) => {
            const td = document.createElement('td');
            td.append(crearSelect(f, fecha, elegibles));
            tr.append(td);
        });

        tbody.append(tr);
    });

    // Buses de la cooperativa que ese día no tienen frecuencia: están en parada.
    const tfoot = document.createElement('tfoot');
    const trPie = document.createElement('tr');
    const thPie = document.createElement('th');
    thPie.scope = 'row';
    thPie.textContent = 'En parada (disponibles)';
    trPie.append(thPie);

    fechas.forEach((fecha) => {
        const td = document.createElement('td');
        const libres = elegibles.filter((b) => !ocupado.has(`${b.id}|${fecha}`));

        if (libres.length === 0) {
            td.className = 'text-muted';
            td.textContent = '—';
        } else {
            libres.forEach((b) => {
                const badge = document.createElement('span');
                badge.className = 'badge text-bg-light border me-1 mb-1';
                badge.textContent = b.placa;
                td.append(badge);
            });
        }
        trPie.append(td);
    });
    tfoot.append(trPie);

    tabla.append(thead, tbody, tfoot);
    contenedor.append(tabla);
}

/* ---------- Asignar, cambiar o quitar un bus ---------- */

async function cambiarCelda(sel, f, fecha) {
    const previa = hojaPor.get(`${f.id}|${fecha}`);
    const nuevoBus = sel.value;

    if (!nuevoBus && !previa) return;

    if (!nuevoBus && !confirm(`¿Quitar el bus de ${f.origen} → ${f.destino} del ${fecha}?`)) {
        sel.value = previa.bus_id;
        return;
    }

    sel.disabled = true;

    try {
        if (!nuevoBus) {
            const { data, error } = await supabase
                .from('hojas_ruta')
                .delete()
                .eq('id', previa.id)
                .select('id');

            if (error) throw error;
            if (!data || data.length === 0) throw new Error('No se pudo quitar el bus (sin permiso).');

            hojas = hojas.filter((h) => h.id !== previa.id);
        } else if (previa) {
            const { data, error } = await supabase
                .from('hojas_ruta')
                .update({ bus_id: nuevoBus })
                .eq('id', previa.id)
                .select('id, frecuencia_id, bus_id, fecha, estado')
                .single();

            if (error) throw error;

            hojas = hojas.map((h) => (h.id === previa.id ? data : h));
        } else {
            const { data, error } = await supabase
                .from('hojas_ruta')
                .insert({ frecuencia_id: f.id, bus_id: nuevoBus, fecha })
                .select('id, frecuencia_id, bus_id, fecha, estado')
                .single();

            if (error) throw error;

            hojas = [...hojas, data];
        }

        indexar();
        dibujar();
    } catch (error) {
        console.error('Error al guardar la hoja de ruta:', error);
        mostrarAlerta(mensajeDeError(error), 'danger');
        sel.value = previa?.bus_id ?? '';
        sel.disabled = false;
    }
}

/* ---------- Relleno automático con rotación ---------- */

// Los buses (ordenados por placa) giran un lugar cada día por las frecuencias
// activas y por los lugares de parada, como en la tabla de la hoja de ruta.
async function rellenarAutomatico() {
    const activas = frecuencias.filter((f) => f.activa);
    const elegibles = buses.filter(esElegible);
    const n = elegibles.length;

    if (activas.length === 0 || n < activas.length) {
        mostrarAlerta('Necesitas al menos un bus con plantilla por cada frecuencia activa.', 'warning');
        return;
    }

    const nuevas = [];
    const usadoNuevo = new Set();
    let omitidas = 0;

    fechas
        .filter((fecha) => fecha >= hoy() && fecha <= limite())
        .forEach((fecha) => {
            const k = numeroDeDia(fecha);

            activas.forEach((f, s) => {
                if (hojaPor.has(`${f.id}|${fecha}`)) return;

                const bus = elegibles[(((s - k) % n) + n) % n];
                const claveBus = `${bus.id}|${fecha}`;

                if (ocupado.has(claveBus) || usadoNuevo.has(claveBus)) {
                    omitidas++;
                    return;
                }

                usadoNuevo.add(claveBus);
                nuevas.push({ frecuencia_id: f.id, bus_id: bus.id, fecha });
            });
        });

    if (nuevas.length === 0) {
        mostrarAlerta(
            omitidas > 0
                ? 'No se pudo rellenar: los buses que tocaban ya están ocupados esos días. Libera alguno y vuelve a intentar.'
                : 'No hay celdas vacías que rellenar en este rango.',
            'info'
        );
        return;
    }

    if (!confirm(`Se asignarán ${nuevas.length} celdas vacías con la rotación de buses. ¿Continuar?`)) return;

    btnAuto.disabled = true;

    try {
        const { data, error } = await supabase
            .from('hojas_ruta')
            .insert(nuevas)
            .select('id, frecuencia_id, bus_id, fecha, estado');

        if (error) throw error;

        hojas = [...hojas, ...(data ?? [])];
        indexar();
        dibujar();

        mostrarAlerta(
            `Se asignaron ${data?.length ?? nuevas.length} celdas.` +
            (omitidas > 0 ? ` ${omitidas} se omitieron porque el bus ya estaba ocupado ese día.` : ''),
            'success'
        );
    } catch (error) {
        console.error('Error al rellenar la hoja de ruta:', error);
        mostrarAlerta(mensajeDeError(error), 'danger');
        btnAuto.disabled = false;
    }
}

/* ---------- Inicio ---------- */

async function iniciar() {
    const rol = await exigirRoles(['administrador', 'cooperativa']);
    if (!rol) return;

    document.getElementById('btnVolver').href = `../${rol}/index.html`;

    inpInicio.value = hoy();
    inpInicio.min = hoy();
    inpInicio.max = limite();

    try {
        const contexto = await obtenerContextoGestion();
        const cooperativas = contexto.cooperativas;

        selCoop.replaceChildren(new Option('Selecciona una cooperativa...', ''));
        cooperativas.forEach((c) => selCoop.append(new Option(c.nombre, c.id)));
        selCoop.disabled = false;

        if (contexto.rol === 'cooperativa' && cooperativas.length === 0) {
            contenedor.replaceChildren(
                nuevoAviso('danger', 'Tu cuenta aún no está asignada a una cooperativa. Contacta al administrador.')
            );
            return;
        }

        selCoop.addEventListener('change', cargarCooperativa);
        inpInicio.addEventListener('change', () => {
            if (!inpInicio.value) inpInicio.value = hoy();
            recargarHojas();
        });
        selDias.addEventListener('change', recargarHojas);
        btnAuto.addEventListener('click', rellenarAutomatico);

        if (cooperativas.length === 1) {
            selCoop.value = cooperativas[0].id;
            await cargarCooperativa();
        }
    } catch (error) {
        console.error('Error al iniciar la hoja de ruta:', error);
        contenedor.replaceChildren(nuevoAviso('danger', 'No se pudo cargar la página.'));
        mostrarAlerta(textoError(error), 'danger');
    }
}

iniciar();

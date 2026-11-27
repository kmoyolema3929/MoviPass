// frontend/pages/frecuencias/hoja-ruta.js
// Hoja de ruta automática por grupo de bus (cambio 7, parte 7.2). La rotación
// la hace la base (generar_hoja_ruta); frontend/js/rotacion.js tiene la misma
// regla (con pruebas) y arma la tabla.

import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { obtenerContextoGestion, textoError } from '../../js/contextoUsuario.js';
import { mostrarAlerta } from '../../js/alertas.js';
import { fechaHoyEcuador, llenarCombo, ponerOpciones, vaciarCombo } from '../../js/combos.js';
import { obtenerGruposBus } from '../../js/gruposBus.js';
import { sumarDias } from '../../js/validaciones.js';
import { armarTablaHojaRuta, busesQueFaltan, textoFlota } from '../../js/rotacion.js';
import { avisoHojaRuta } from '../../js/reglasOperacion.js';

const $ = id => document.getElementById(id);
const DIAS_MAX = 14;
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const selCooperativa = $('cooperativa');
const selGrupo = $('grupo');
const inpDesde = $('fechaInicio');
const selDias = $('numeroDias');
const btnGenerar = $('btnGenerar');
const contenedor = $('contenedorHoja');
const avisoFlota = $('flota');
const avisoAutomatico = $('avisoAutomatico');
const resultado = $('resultado');

let rol = null;
let resumen = null; // { frecuencias, buses } del grupo
let ocupado = false;

const hoy = () => fechaHoyEcuador();
const limite = () => sumarDias(hoy(), DIAS_MAX);

function mensajeError(error) {
    if (['23502', '23503', '23505', '23514', '40001', '42501', '55006'].includes(error?.code) && error.message) return error.message;
    return textoError(error);
}

function fechaCorta(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
    return `${DIAS_SEMANA[dia]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function fechasDelRango() {
    const desde = inpDesde.value || hoy();
    return Array.from({ length: Number(selDias.value) }, (_, i) => sumarDias(desde, i));
}

function mostrarResultado(texto, tipo) {
    resultado.className = `alert alert-${tipo}`;
    resultado.textContent = texto;
}

function el(etiqueta, clase = '', texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    return nodo;
}

/* ---------- Carga ---------- */

async function cargarGrupos() {
    resumen = null;
    contenedor.replaceChildren(el('p', 'text-center py-3 text-muted mb-0', 'Elige un grupo de bus.'));
    avisoFlota.classList.add('d-none');
    avisoAutomatico.classList.add('d-none');
    btnGenerar.disabled = true;

    if (!selCooperativa.value) {
        vaciarCombo(selGrupo, 'Primero elige la cooperativa');
        return;
    }

    const grupos = await llenarCombo(selGrupo, {
        cargar: () => obtenerGruposBus(selCooperativa.value),
        inicial: 'Selecciona un grupo...',
        vacio: 'La cooperativa no tiene grupos de bus',
        error: 'No se pudieron cargar los grupos.',
        alReintentar: () => void cargarHoja()
    });

    if (grupos && selGrupo.value) await cargarHoja();
}

async function cargarHoja() {
    const grupoId = selGrupo.value;
    if (!grupoId) return;

    contenedor.replaceChildren(el('p', 'text-center py-3 text-muted mb-0', 'Cargando hoja de ruta...'));

    try {
        const fechas = fechasDelRango();
        const [r1, r2, r3] = await Promise.all([
            supabase.rpc('resumen_grupo_hoja_ruta', { p_grupo_id: grupoId }),
            supabase.rpc('obtener_hoja_ruta', { p_grupo_id: grupoId, p_desde: fechas[0], p_hasta: fechas.at(-1) }),
            supabase.from('grupos_bus').select('nombre, aviso_hoja_ruta, aviso_hoja_ruta_en').eq('id', grupoId).maybeSingle()
        ]);

        if (r1.error) throw r1.error;
        if (r2.error) throw r2.error;
        if (r3.error) console.error('No se pudo leer el aviso de la hoja de ruta:', r3.error);

        resumen = r1.data;
        mostrarAvisoAutomatico(r3.error ? null : r3.data);
        mostrarFlota();
        dibujarTabla(armarTablaHojaRuta({ frecuencias: resumen.frecuencias, turnos: r2.data ?? [], fechas }));
    } catch (error) {
        console.error('No se pudo cargar la hoja de ruta:', error);
        contenedor.replaceChildren(el('p', 'text-center py-3 text-danger mb-0', mensajeError(error)));
    }
}

// Cambio 4.4: lo que impidió la generación nocturna (se borra al generar bien).
function mostrarAvisoAutomatico(grupo) {
    const aviso = avisoHojaRuta(grupo);
    avisoAutomatico.classList.toggle('d-none', !aviso);
    if (!aviso) return;

    avisoAutomatico.replaceChildren(
        el('strong', '', 'La generación automática no se pudo hacer. '),
        document.createTextNode(`${aviso.texto} ${aviso.cuando}`.trim()),
        el('div', 'small mt-1', 'Corrige el problema (por ejemplo, agrega buses con plantilla al grupo) y genera la hoja de ruta: el aviso se quita solo.')
    );
}

function mostrarFlota() {
    const frecuencias = resumen.frecuencias.filter(f => f.activa).length;
    const buses = resumen.buses.filter(b => b.con_plantilla).length;
    const faltan = frecuencias === 0 || busesQueFaltan(frecuencias, buses) > 0;
    const sinPlantilla = resumen.buses.filter(b => !b.con_plantilla).map(b => b.numero_interno);

    avisoFlota.className = `alert ${faltan ? 'alert-danger' : 'alert-info'}`;
    avisoFlota.textContent = textoFlota(frecuencias, buses) +
        (sinPlantilla.length ? ` Sin plantilla (no entran en la rotación): ${sinPlantilla.join(', ')}.` : '');

    btnGenerar.disabled = faltan || ocupado;
    btnGenerar.title = faltan ? 'No se puede generar: revisa el aviso de la flota.' : '';
}

/* ---------- Tabla ---------- */

function textoBuses(celda) {
    return celda.buses.map(b => b.numero_interno).join(', ');
}

function dibujarTabla({ filas, columnas }) {
    const tabla = el('table', 'table table-bordered align-middle mb-0 hoja-ruta');
    const cabecera = el('thead', 'table-dark');
    const filaCabecera = el('tr');
    filaCabecera.appendChild(el('th', '', 'Frecuencia / parada'));

    columnas.forEach(columna => {
        const th = el('th', 'text-center');
        th.appendChild(el('div', '', fechaCorta(columna.fecha)));

        if (!columna.generado) {
            th.appendChild(el('div', 'small fw-normal text-warning', 'sin generar'));
        } else if (columna.boletos > 0) {
            th.appendChild(el('div', 'small fw-normal', `🎫 ${columna.boletos}`));
        } else if (columna.fecha >= hoy()) {
            const borrar = el('button', 'btn btn-link btn-sm text-white-50 p-0', 'Borrar día');
            borrar.type = 'button';
            borrar.addEventListener('click', () => void borrarDia(columna.fecha));
            th.appendChild(borrar);
        }

        filaCabecera.appendChild(th);
    });

    cabecera.appendChild(filaCabecera);

    const cuerpo = el('tbody');
    const reten = filas.find(f => f.tipo === 'reten');

    filas.forEach(fila => {
        const tr = el('tr', fila.tipo === 'frecuencia' ? '' : 'fila-parada');
        const titulo = el('td', fila.tipo === 'frecuencia' ? '' : 'fst-italic', fila.etiqueta);
        if (fila.tipo === 'frecuencia' && !fila.activa) titulo.appendChild(el('span', 'badge bg-secondary ms-1', 'Inactiva'));
        tr.appendChild(titulo);

        fila.celdas.forEach((celda, i) => {
            const td = el('td');

            if (celda.buses.length === 0) {
                td.appendChild(el('span', 'sin-generar', '—'));
            } else {
                const bus = el('div', 'bus', textoBuses(celda));
                bus.title = celda.buses.map(b => `${b.numero_interno} · ${b.placa}`).join('\n');
                td.appendChild(bus);
                if (celda.boletos) td.appendChild(el('div', 'small text-muted', `🎫 ${celda.boletos}`));

                // Reemplazo rápido con el bus del retén (desde hoy).
                const busReten = reten.celdas[i].buses[0];
                if (fila.tipo === 'frecuencia' && celda.hoja_ruta_id && busReten && celda.fecha >= hoy()) {
                    const usar = el('button', 'btn btn-outline-secondary btn-sm py-0 mt-1', 'Usar retén');
                    usar.type = 'button';
                    usar.title = `Poner el bus ${busReten.numero_interno} (retén) en lugar del ${textoBuses(celda)}`;
                    usar.addEventListener('click', () => void usarReten(celda, fila, busReten));
                    td.appendChild(usar);
                }
            }

            tr.appendChild(td);
        });

        cuerpo.appendChild(tr);
    });

    tabla.append(cabecera, cuerpo);
    contenedor.replaceChildren(tabla);
}

/* ---------- Acciones ---------- */

async function generar() {
    if (ocupado || !selGrupo.value) return;

    const fechas = fechasDelRango();
    const desde = fechas[0];
    const hasta = fechas.at(-1);

    if (desde < hoy()) {
        mostrarResultado('No se pueden generar días pasados: elige desde hoy.', 'warning');
        return;
    }

    if (hasta > limite()) {
        mostrarResultado(`Solo se puede generar hasta 14 días de anticipación (hasta el ${fechaCorta(limite())}). Elige menos días.`, 'warning');
        return;
    }

    const confirmar = `¿Generar la hoja de ruta del ${fechaCorta(desde)} al ${fechaCorta(hasta)}? ` +
        'Los días que ya estaban generados se rehacen, menos los que tienen boletos vendidos.';
    if (!confirm(confirmar)) return;

    ocupado = true;
    btnGenerar.disabled = true;
    btnGenerar.textContent = 'Generando...';

    try {
        const { data, error } = await supabase.rpc('generar_hoja_ruta', {
            p_grupo_id: selGrupo.value,
            p_desde: desde,
            p_hasta: hasta
        });

        if (error) throw error;

        const generados = data?.generados ?? [];
        const conservados = data?.conservados ?? [];
        let texto = `Se ${generados.length === 1 ? 'generó 1 día' : `generaron ${generados.length} días`}.`;

        if (conservados.length) {
            texto += ' Se conservaron (tienen boletos vendidos): ' +
                conservados.map(c => `${fechaCorta(c.fecha)} (${c.boletos} ${c.boletos === 1 ? 'boleto' : 'boletos'})`).join(', ') + '.';
        }

        mostrarResultado(texto, conservados.length ? 'warning' : 'success');
    } catch (error) {
        console.error('No se pudo generar la hoja de ruta:', error);
        mostrarResultado(mensajeError(error), 'danger');
    } finally {
        ocupado = false;
        btnGenerar.textContent = 'Generar';
        await cargarHoja();
    }
}

async function usarReten(celda, fila, busReten) {
    if (ocupado) return;
    if (!confirm(`${fechaCorta(celda.fecha)} · ${fila.etiqueta}: ¿poner el bus ${busReten.numero_interno} (retén) en lugar del ${textoBuses(celda)}?`)) return;

    ocupado = true;
    try {
        const { error } = await supabase.rpc('reemplazar_con_reten', { p_hoja_ruta_id: celda.hoja_ruta_id });
        if (error) throw error;
        mostrarResultado(`Listo: el bus ${busReten.numero_interno} hace ${fila.etiqueta} el ${fechaCorta(celda.fecha)} y el ${textoBuses(celda)} queda de retén.`, 'success');
    } catch (error) {
        console.error('No se pudo usar el retén:', error);
        mostrarResultado(mensajeError(error), 'danger');
    } finally {
        ocupado = false;
        await cargarHoja();
    }
}

async function borrarDia(fecha) {
    if (ocupado) return;
    if (!confirm(`¿Borrar la hoja de ruta del ${fechaCorta(fecha)} de este grupo? Ese día no se podrá vender hasta que lo generes otra vez.`)) return;

    ocupado = true;
    try {
        const { error } = await supabase.rpc('borrar_dia_hoja_ruta', { p_grupo_id: selGrupo.value, p_fecha: fecha });
        if (error) throw error;
        mostrarResultado(`Se borró la hoja de ruta del ${fechaCorta(fecha)}.`, 'success');
    } catch (error) {
        console.error('No se pudo borrar el día:', error);
        mostrarResultado(mensajeError(error), 'danger');
    } finally {
        ocupado = false;
        await cargarHoja();
    }
}

/* ---------- Inicio ---------- */

async function iniciar() {
    rol = await exigirRoles(['administrador', 'cooperativa', 'oficinista']);
    if (!rol) return;

    $('btnVolver').href = `../${rol}/index.html`;
    $('marca').href = `../${rol}/index.html`;
    if (rol === 'oficinista') {
        $('marca').textContent = 'MoviPass - Oficinista'; // cambio 4: también gestiona las frecuencias
    }

    inpDesde.value = hoy();
    inpDesde.max = limite();

    try {
        const { cooperativas } = await obtenerContextoGestion();

        ponerOpciones(selCooperativa, cooperativas, {
            inicial: 'Selecciona una cooperativa...',
            vacio: 'Tu cuenta no tiene cooperativas asignadas'
        });
        $('grupoCooperativa').classList.toggle('d-none', cooperativas.length === 1);

        if (cooperativas.length === 0) {
            contenedor.replaceChildren(el('p', 'text-center py-3 text-danger mb-0', 'Tu cuenta no está asignada a una cooperativa.'));
            return;
        }

        await cargarGrupos();
    } catch (error) {
        console.error('Error al iniciar la hoja de ruta:', error);
        mostrarAlerta(mensajeError(error), 'danger');
    }
}

selCooperativa.addEventListener('change', () => void cargarGrupos());
selGrupo.addEventListener('change', () => { resultado.className = 'alert d-none'; void cargarHoja(); });
inpDesde.addEventListener('change', () => { if (!inpDesde.value) inpDesde.value = hoy(); void cargarHoja(); });
selDias.addEventListener('change', () => void cargarHoja());
btnGenerar.addEventListener('click', () => void generar());

iniciar();

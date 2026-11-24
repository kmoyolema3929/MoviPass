// frontend/js/frecuenciasForm.js
// Frecuencias aprobadas (cambio 7, parte 7.1): reglas del formulario, paradas
// y orden en la hoja de ruta. Sin DOM ni Supabase (se prueba con node --test).
// La base repite las reglas (validar_frecuencia y guardar_frecuencia).

import { etiquetaCanton, textoComparable } from './lugares.js';

/** El tipo 'compartida' de la base se muestra como "Con paradas". */
export const TIPOS_FRECUENCIA = { directa: 'Directa', compartida: 'Con paradas' };

export const MAX_RESOLUCION = 60;

export const textoTipo = tipo => TIPOS_FRECUENCIA[tipo] ?? tipo ?? '';

export { textoComparable };

/**
 * Opciones para escribir o elegir una parada: la etiqueta de cada cantón
 * ("Pastaza (Puyo)", "Olmedo (Loja)"), que ya es única.
 */
export function opcionesParada(cantones = []) {
    return cantones
        .map(c => ({ canton_id: c.id, texto: etiquetaCanton(c) }))
        .sort((a, b) => a.texto.localeCompare(b.texto, 'es'));
}

/**
 * Lo que se escribió en una parada: un cantón de la lista (por su etiqueta, o
 * por su nombre si solo hay un cantón con ese nombre) o un lugar escrito.
 * @returns {{canton_id: number|null, nombre: string}}
 */
export function resolverParada(texto, opciones = []) {
    const buscado = textoComparable(texto);
    const limpio = String(texto ?? '').trim().replace(/\s+/g, ' ');

    if (!buscado) return { canton_id: null, nombre: '' };

    const exacta = opciones.find(o => textoComparable(o.texto) === buscado);
    if (exacta) return { canton_id: exacta.canton_id, nombre: '' };

    // "Olmedo" sin la provincia: solo si hay un único cantón que empieza así.
    const porNombre = opciones.filter(o => textoComparable(o.texto.replace(/\s*\(.*\)$/, '')) === buscado);
    if (porNombre.length === 1) return { canton_id: porNombre[0].canton_id, nombre: '' };

    return { canton_id: null, nombre: limpio };
}

/**
 * Revisa una frecuencia y sus paradas. Devuelve { campo: problema } y, si hay,
 * paradas: [{ lugar?, hora? }] con el problema de cada parada.
 * valores: { cooperativaId, origenCantonId, destinoCantonId, hora, precio,
 *            resolucion, grupoId, tipo }
 * paradas: [{ canton_id, nombre, hora_estimada }]
 */
export function revisarFrecuencia(valores, paradas = []) {
    const errores = {};

    if (!valores.cooperativaId) errores.cooperativaId = 'Elige la cooperativa.';
    if (!valores.origenCantonId) errores.origenCantonId = 'Elige el cantón de origen.';
    if (!valores.destinoCantonId) errores.destinoCantonId = 'Elige el cantón de destino.';
    else if (String(valores.destinoCantonId) === String(valores.origenCantonId)) {
        errores.destinoCantonId = 'El destino no puede ser el mismo cantón que el origen.';
    }

    if (!/^\d{2}:\d{2}/.test(String(valores.hora ?? ''))) errores.hora = 'Escribe la hora de salida.';

    const precio = Number(valores.precio);
    if (String(valores.precio ?? '').trim() === '' || !Number.isFinite(precio) || precio < 0) {
        errores.precio = 'Escribe un precio válido (0 o más).';
    }

    const resolucion = String(valores.resolucion ?? '').trim();
    if (!resolucion) errores.resolucion = 'Escribe el número de resolución de la ANT.';
    else if (resolucion.length > MAX_RESOLUCION) errores.resolucion = `Máximo ${MAX_RESOLUCION} caracteres.`;

    if (!valores.grupoId) errores.grupoId = 'Elige el grupo de bus.';
    if (!TIPOS_FRECUENCIA[valores.tipo]) errores.tipo = 'Elige el tipo de frecuencia.';

    if (valores.tipo === 'compartida') {
        if (paradas.length === 0) errores.paradasGeneral = 'Agrega al menos una parada.';

        const vistas = new Set();
        const problemas = paradas.map(parada => {
            const problema = {};
            const lugar = parada.canton_id ? `c${parada.canton_id}` : `t${textoComparable(parada.nombre)}`;

            if (!parada.canton_id && textoComparable(parada.nombre).length < 2) {
                problema.lugar = 'Elige o escribe el lugar.';
            } else if (parada.canton_id && [String(valores.origenCantonId), String(valores.destinoCantonId)].includes(String(parada.canton_id))) {
                problema.lugar = 'No puede ser el origen ni el destino.';
            } else if (vistas.has(lugar)) {
                problema.lugar = 'Parada repetida.';
            }

            if (!/^\d{2}:\d{2}/.test(String(parada.hora_estimada ?? ''))) problema.hora = 'Escribe la hora estimada.';

            vistas.add(lugar);
            return problema;
        });

        if (problemas.some(p => p.lugar || p.hora)) errores.paradas = problemas;
    }

    return errores;
}

/** Datos para guardar_frecuencia. */
export function datosFrecuencia(valores) {
    return {
        origen_canton_id: Number(valores.origenCantonId),
        destino_canton_id: Number(valores.destinoCantonId),
        hora: String(valores.hora).slice(0, 5),
        precio_base: Math.round(Number(valores.precio) * 100) / 100,
        numero_resolucion: String(valores.resolucion).trim().replace(/\s+/g, ' '),
        grupo_id: valores.grupoId,
        activa: valores.activa !== false && valores.activa !== 'false',
        tipo: valores.tipo
    };
}

/** Qué le falta a una frecuencia migrada ("por corregir"). */
export function porCorregir(frecuencia) {
    const falta = [];
    if (!frecuencia.origen_canton_id) falta.push('cantón de origen');
    if (!frecuencia.destino_canton_id) falta.push('cantón de destino');
    if (!frecuencia.grupo_id) falta.push('grupo de bus');
    return falta;
}

/**
 * Orden de las filas en la hoja de ruta: primero las que tienen orden, en ese
 * orden; las demás, por hora de salida.
 */
export function ordenarParaHojaRuta(frecuencias) {
    return [...frecuencias].sort((a, b) => {
        const oa = a.orden_hoja_ruta ?? Infinity;
        const ob = b.orden_hoja_ruta ?? Infinity;
        return (oa - ob) || String(a.hora).localeCompare(String(b.hora)) || (a.id - b.id);
    });
}

/**
 * Sube (-1) o baja (+1) una frecuencia dentro de su grupo. Devuelve los ids
 * del grupo en el nuevo orden, o null si no se puede mover.
 */
export function moverFrecuencia(frecuencias, id, direccion) {
    const actual = frecuencias.find(f => f.id === id);
    if (!actual?.grupo_id) return null;

    const ids = ordenarParaHojaRuta(frecuencias.filter(f => f.grupo_id === actual.grupo_id)).map(f => f.id);
    const desde = ids.indexOf(id);
    const hasta = desde + direccion;

    if (hasta < 0 || hasta >= ids.length) return null;

    [ids[desde], ids[hasta]] = [ids[hasta], ids[desde]];
    return ids;
}

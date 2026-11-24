// frontend/js/rotacion.js
// Rotación cíclica (en diagonal) de la hoja de ruta de un grupo de bus
// (cambio 7, parte 7.2). Sin DOM ni Supabase: se prueba con node --test y la
// base hace lo mismo en generar_hoja_ruta.
//
// Filas de un día (B = cantidad de buses del grupo):
//   1..F        las frecuencias activas del grupo, en su orden de hoja de ruta
//   F+1..B-1    Parada 1 = descanso (uno o más buses)
//   B           Parada 2 = retén (un bus, para cubrir emergencias)
// Cada día los buses bajan una fila: el de la fila k pasa a la k+1 y el del
// retén sube a la primera frecuencia.

/** Buses que faltan para generar: se necesitan frecuencias + 2 (descanso y retén). */
export function busesQueFaltan(frecuencias, buses) {
    return Math.max(0, frecuencias + 2 - buses);
}

/** Orden inicial de los buses: por número interno (numérico si lo es). */
export function ordenInicial(buses) {
    return [...buses]
        .sort((a, b) => String(a.numero_interno).localeCompare(String(b.numero_interno), 'es', { numeric: true }))
        .map(b => b.id);
}

/**
 * Orden con el que sigue la rotación: el del último día, sin los buses que ya
 * no están en el grupo y con los nuevos al final (por número interno).
 */
export function continuarOrden(ordenAnterior, buses) {
    const ids = new Set(buses.map(b => b.id));
    const siguen = ordenAnterior.filter(id => ids.has(id));
    const nuevos = ordenInicial(buses.filter(b => !siguen.includes(b.id)));
    return [...siguen, ...nuevos];
}

/** Rota el orden k días: cada día el último (retén) pasa a la primera fila. */
export function rotar(orden, dias = 1) {
    const n = orden.length;
    if (n === 0) return [];
    const k = ((dias % n) + n) % n;
    return [...orden.slice(n - k), ...orden.slice(0, n - k)];
}

/**
 * Reparte un orden de buses en las filas de un día.
 * @returns {{ frecuencias: Map<any, string>, descanso: string[], reten: string }}
 */
export function repartirDia(orden, frecuenciaIds) {
    const frecuencias = new Map(frecuenciaIds.map((id, i) => [id, orden[i]]));
    return {
        frecuencias,
        descanso: orden.slice(frecuenciaIds.length, orden.length - 1),
        reten: orden[orden.length - 1]
    };
}

/**
 * Genera varios días seguidos.
 * @param {object} p
 * @param {{id, numero_interno}[]} p.buses       buses del grupo (con plantilla)
 * @param {any[]} p.frecuencias                    ids de las frecuencias activas, en orden
 * @param {number} p.dias                          cantidad de días
 * @param {string[]|null} [p.ordenAnterior]        orden del último día ya generado
 * @param {number} [p.diasDesdeAnterior=1]         días entre ese último día y el primero nuevo
 * @returns {string[][]} el orden de cada día (filas: frecuencias, descanso, retén)
 */
export function generarDias({ buses, frecuencias, dias, ordenAnterior = null, diasDesdeAnterior = 1 }) {
    const faltan = busesQueFaltan(frecuencias.length, buses.length);
    if (frecuencias.length === 0) throw new Error('El grupo no tiene frecuencias activas.');
    if (faltan > 0) throw new Error(`Faltan ${faltan} ${faltan === 1 ? 'bus' : 'buses'}.`);

    let orden = ordenAnterior
        ? rotar(continuarOrden(ordenAnterior, buses), diasDesdeAnterior)
        : ordenInicial(buses);

    const resultado = [];
    for (let d = 0; d < dias; d++) {
        if (d > 0) orden = rotar(orden, 1);
        resultado.push(orden);
    }
    return resultado;
}

/** Texto del aviso de flota mínima. */
export function textoFlota(frecuencias, buses) {
    const necesarios = frecuencias + 2;
    const faltan = busesQueFaltan(frecuencias, buses);

    if (frecuencias === 0) return 'El grupo no tiene frecuencias activas.';

    const base = `${buses} ${buses === 1 ? 'bus' : 'buses'} con plantilla y ${frecuencias} ` +
        `${frecuencias === 1 ? 'frecuencia activa' : 'frecuencias activas'}: se necesitan al menos ${necesarios} ` +
        '(frecuencias + descanso + retén).';

    return faltan > 0 ? `${base} Faltan ${faltan} ${faltan === 1 ? 'bus' : 'buses'}.` : base;
}

/**
 * Tabla de la hoja de ruta para la pantalla: frecuencias (activas en su orden,
 * y las inactivas solo si tienen turnos en el rango), Parada 1 y Parada 2 en
 * filas; los días en columnas.
 * @param {object} p
 * @param {{id, origen, destino, hora, activa}[]} p.frecuencias  del grupo, ya en orden
 * @param {{fecha, tipo, frecuencia_id, posicion, hoja_ruta_id, bus_id, numero_interno, placa, boletos}[]} p.turnos
 * @param {string[]} p.fechas  días de las columnas (AAAA-MM-DD)
 */
export function armarTablaHojaRuta({ frecuencias, turnos, fechas }) {
    const conTurnos = new Set(turnos.filter(t => t.tipo === 'frecuencia').map(t => t.frecuencia_id));
    const visibles = frecuencias.filter(f => f.activa || conTurnos.has(f.id));

    const celda = (fecha, filtro) => {
        const delDia = turnos
            .filter(t => t.fecha === fecha && filtro(t))
            .sort((a, b) => (a.posicion ?? 0) - (b.posicion ?? 0));
        return {
            fecha,
            buses: delDia.map(t => ({ id: t.bus_id, numero_interno: t.numero_interno, placa: t.placa })),
            hoja_ruta_id: delDia[0]?.hoja_ruta_id ?? null,
            boletos: delDia.reduce((suma, t) => suma + (t.boletos ?? 0), 0)
        };
    };

    const filas = [
        ...visibles.map(f => ({
            tipo: 'frecuencia',
            id: f.id,
            etiqueta: `${f.origen} → ${f.destino} ${String(f.hora).slice(0, 5)}`,
            activa: f.activa,
            celdas: fechas.map(fecha => celda(fecha, t => t.tipo === 'frecuencia' && t.frecuencia_id === f.id))
        })),
        { tipo: 'descanso', etiqueta: 'Parada 1 (descanso)', celdas: fechas.map(fecha => celda(fecha, t => t.tipo === 'descanso')) },
        { tipo: 'reten', etiqueta: 'Parada 2 (retén)', celdas: fechas.map(fecha => celda(fecha, t => t.tipo === 'reten')) }
    ];

    const generado = new Set(turnos.map(t => t.fecha));
    const columnas = fechas.map(fecha => ({
        fecha,
        generado: generado.has(fecha),
        boletos: turnos.filter(t => t.fecha === fecha).reduce((suma, t) => suma + (t.boletos ?? 0), 0)
    }));

    return { filas, columnas };
}

// frontend/js/reglasOperacion.js
// Reglas de la operación de los viajes (cambio 4): estado operativo,
// despacho del día y avisos de comprobantes. Sin DOM ni Supabase
// (se prueban con node --test). La base repite las reglas en
// habilitar_viaje, quitar_habilitacion y _viaje_para_venta.

/** Estados operativos del viaje, en orden. */
export const ESTADOS_OPERATIVOS = {
    programado: { texto: 'Programado', clase: 'text-bg-secondary' },
    pendiente_inicio: { texto: 'Pendiente de inicio', clase: 'text-bg-warning' },
    en_curso: { texto: 'En curso', clase: 'text-bg-primary' },
    finalizado: { texto: 'Finalizado', clase: 'text-bg-success' }
};

/** Texto y clase del estado operativo (desconocido: se muestra tal cual). */
export function estadoOperativo(estado) {
    return ESTADOS_OPERATIVOS[estado] ?? { texto: String(estado ?? '—'), clase: 'text-bg-secondary' };
}

/** "Directa" o "Con paradas" según el tipo de la frecuencia. */
export function textoTipoViaje(tipo) {
    return tipo === 'compartida' ? 'Con paradas' : 'Directa';
}

/** "12 (PBA-1234)" */
export function textoBus(bus) {
    if (!bus) return '—';
    return bus.placa ? `${bus.numero_interno} (${bus.placa})` : String(bus.numero_interno ?? '—');
}

/** "Pérez Loor, Ana (chofer)" */
export function textoUsuarioBus(usuario) {
    if (!usuario) return '';
    const funcion = usuario.funcion_bus === 'dueno' ? 'dueño' : usuario.funcion_bus;
    const nombre = `${usuario.apellidos ?? ''}, ${usuario.nombres ?? ''}`.replace(/^, |, $/g, '').trim();
    return funcion ? `${nombre} (${funcion})` : nombre;
}

/**
 * Por qué no se puede habilitar (o cambiar el usuario bus de) un viaje.
 * @returns {string} '' si se puede.
 */
export function motivoNoHabilitable(viaje) {
    if (!viaje) return 'El viaje no existe.';
    if (viaje.estado_operativo === 'en_curso') return 'El viaje ya está en curso.';
    if (viaje.estado_operativo === 'finalizado') return 'El viaje ya terminó.';
    if (viaje.estado_hoja === 'Cancelado') return 'El viaje está cancelado en la hoja de ruta.';
    return '';
}

/**
 * Usuario bus que se propone para un viaje: el ya habilitado, o el del bus
 * si está activo en la cooperativa. '' si no hay ninguno.
 */
export function usuarioBusPorDefecto(viaje, usuarios = []) {
    const activos = new Set(usuarios.map((u) => u.id));
    const habilitado = viaje?.usuario_bus?.id;
    if (habilitado && activos.has(habilitado)) return habilitado;

    const delBus = viaje?.bus?.usuario_bus_id;
    return delBus && activos.has(delBus) ? delBus : '';
}

/** Error del combo del usuario bus ('' si está bien). */
export function revisarUsuarioBus(valor, usuarios = []) {
    if (!valor) return 'Elige el usuario bus que hará este viaje.';
    if (!usuarios.some((u) => u.id === valor)) return 'Ese usuario bus ya no está activo. Recarga la página.';
    return '';
}

/**
 * Viajes que se pueden vender en ventanilla: no en curso ni finalizados,
 * con la hoja de ruta programada y, si son de hoy, con la hora de salida por delante.
 * @param {object[]} viajes con fecha, frecuencias.hora, estado_operativo, hojas_ruta
 * @param {string} hoy "AAAA-MM-DD" (fecha de Ecuador)
 * @param {string} horaActual "HH:MM" (hora de Ecuador)
 */
export function viajesVendibles(viajes = [], hoy, horaActual) {
    return viajes
        .filter((v) => !['en_curso', 'finalizado'].includes(v.estado_operativo))
        .filter((v) => !v.hojas_ruta || v.hojas_ruta.estado === 'Programado')
        .filter((v) => v.fecha > hoy || (v.fecha === hoy && String(v.frecuencias?.hora ?? '').slice(0, 5) > horaActual))
        .sort((a, b) =>
            a.fecha.localeCompare(b.fecha) ||
            String(a.frecuencias?.hora ?? '').localeCompare(String(b.frecuencias?.hora ?? '')));
}

/** Hora de Ecuador "HH:MM". */
export function horaEcuador(ahora = new Date()) {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(ahora);
}

/**
 * Cambio de Realtime en compras que es un comprobante nuevo por revisar
 * (la compra pasó a pendiente_validacion y aún no estaba en la bandeja).
 * @param {{eventType: string, new: object}} cambio
 * @param {Set<string>} idsEnBandeja
 */
export function esComprobanteNuevo(cambio, idsEnBandeja = new Set()) {
    const fila = cambio?.new;
    if (!fila?.id || !['INSERT', 'UPDATE'].includes(cambio.eventType)) return false;
    return fila.estado === 'pendiente_validacion' && !idsEnBandeja.has(fila.id);
}

/** "3 comprobantes por revisar" */
export function textoPendientes(cantidad) {
    const n = Number(cantidad) || 0;
    if (n === 0) return 'No hay comprobantes por revisar';
    return n === 1 ? '1 comprobante por revisar' : `${n} comprobantes por revisar`;
}

/* ----------------------------------------------------------------------
   Cambio 4, parte 4.3: app del usuario bus. La base repite estas reglas en
   iniciar_viaje, finalizar_viaje, validar_boleto y vender_en_ruta
   (20261126090000_app_usuario_bus.sql).
   ---------------------------------------------------------------------- */

/**
 * Qué puede hacer el usuario bus con su viaje.
 * Validar y vender solo con el viaje en curso.
 * @returns {{iniciar: boolean, validar: boolean, vender: boolean, finalizar: boolean,
 *            manifiesto: boolean, reporte: boolean, aviso: string}}
 */
export function accionesDelViaje(viaje) {
    const estado = viaje?.estado_operativo;
    const enCurso = estado === 'en_curso';
    const cancelado = viaje?.estado_hoja === 'Cancelado';

    let aviso = '';
    if (estado === 'pendiente_inicio') {
        aviso = cancelado
            ? 'El viaje está cancelado en la hoja de ruta. Consulta con la oficina.'
            : 'Inicia el viaje para validar boletos y vender en ruta.';
    } else if (estado === 'finalizado') {
        aviso = 'Viaje finalizado: las ventas y validaciones están cerradas.';
    } else if (!enCurso) {
        aviso = 'Este viaje ya no está habilitado para ti. Consulta con la oficina.';
    }

    return {
        iniciar: estado === 'pendiente_inicio' && !cancelado,
        validar: enCurso,
        vender: enCurso,
        finalizar: enCurso,
        manifiesto: ['pendiente_inicio', 'en_curso', 'finalizado'].includes(estado),
        reporte: enCurso || estado === 'finalizado',
        aviso
    };
}

/** "Hoy no tienes viajes" o "2 viajes hoy". */
export function textoMisViajes(cantidad) {
    const n = Number(cantidad) || 0;
    if (n === 0) return 'Hoy no tienes viajes asignados.';
    return n === 1 ? 'Tienes 1 viaje hoy.' : `Tienes ${n} viajes hoy.`;
}

/** Hora de Ecuador "HH:MM" de una fecha y hora (timestamptz), o '' si no hay. */
export function horaReal(marca) {
    if (!marca) return '';
    const fecha = new Date(marca);
    return Number.isNaN(fecha.getTime()) ? '' : horaEcuador(fecha);
}

/**
 * Código del boleto como lo guarda la base: sin espacios, en mayúsculas y
 * con el prefijo "MP-" si se escribió solo la parte final.
 */
export function normalizarCodigoBoleto(texto) {
    const limpio = String(texto ?? '').replace(/\s/g, '').toUpperCase();
    return /^[0-9A-F]{10}$/.test(limpio) ? `MP-${limpio}` : limpio;
}

/** Error del campo del código ('' si está bien). */
export function revisarCodigoBoleto(texto) {
    const codigo = normalizarCodigoBoleto(texto);
    if (!codigo) return 'Escribe el código del boleto o escanea el QR.';
    if (codigo.length > 40 || !/^[A-Z0-9-]+$/.test(codigo)) {
        return 'El código no es válido (ejemplo: MP-1A2B3C4D5E).';
    }
    return '';
}

/** Cómo se muestra cada resultado de validar_boleto. */
export const RESULTADOS_VALIDACION = {
    abordado: { titulo: 'PUEDE ABORDAR', clase: 'resultado-ok', icono: '✔' },
    ya_abordo: { titulo: 'YA ABORDÓ', clase: 'resultado-aviso', icono: '!' },
    otro_viaje: { titulo: 'OTRO VIAJE', clase: 'resultado-error', icono: '✖' },
    no_pagado: { titulo: 'NO PAGADO', clase: 'resultado-error', icono: '✖' },
    anulado: { titulo: 'ANULADO', clase: 'resultado-error', icono: '✖' },
    no_existe: { titulo: 'NO EXISTE', clase: 'resultado-error', icono: '?' }
};

export function resultadoValidacion(resultado) {
    return RESULTADOS_VALIDACION[resultado]
        ?? { titulo: String(resultado ?? '').toUpperCase(), clase: 'resultado-error', icono: '?' };
}

/** Tarifa pagada en grande: "TERCERA EDAD (−50 %)" o "ADULTO (tarifa normal)". */
export function textoTarifaPagada(boleto) {
    if (!boleto) return '';
    const nombre = String(boleto.tarifa ?? boleto.tipo ?? '').toUpperCase();
    const descuento = Number(boleto.descuento ?? 0);
    return descuento > 0 ? `${nombre} (−${descuento} %)` : `${nombre} (tarifa normal)`;
}

/** Estados del boleto en el manifiesto (los anulados no se muestran). */
export const ESTADOS_BOLETO = {
    abordado: { texto: 'Abordó', clase: 'text-bg-success' },
    emitido: { texto: 'Por abordar', clase: 'text-bg-primary' },
    reservado: { texto: 'Sin pagar', clase: 'text-bg-danger' }
};

export function estadoBoleto(estado) {
    return ESTADOS_BOLETO[estado] ?? { texto: String(estado ?? '—'), clase: 'text-bg-secondary' };
}

/** Filtros del manifiesto (sin filtro = todos). */
export const FILTROS_MANIFIESTO = [
    { codigo: 'emitido', nombre: 'Por abordar' },
    { codigo: 'abordado', nombre: 'Abordaron' },
    { codigo: 'reservado', nombre: 'Sin pagar' }
];

/**
 * Boletos del manifiesto con un estado y/o una cédula (o parte del nombre).
 * @param {object[]} boletos
 * @param {{estado?: string, texto?: string}} filtro
 */
export function filtrarManifiesto(boletos = [], { estado = '', texto = '' } = {}) {
    const buscado = String(texto ?? '').trim().toLowerCase();
    return boletos
        .filter((b) => !estado || b.estado === estado)
        .filter((b) => !buscado
            || String(b.cedula ?? '').includes(buscado)
            || `${b.nombres ?? ''} ${b.apellidos ?? ''}`.toLowerCase().includes(buscado))
        .sort((a, b) => Number(a.numero_asiento) - Number(b.numero_asiento));
}

/** Conteos del manifiesto. */
export function conteoManifiesto(boletos = [], asientos = 0) {
    const contar = (estado) => boletos.filter((b) => b.estado === estado).length;
    const ocupados = boletos.filter((b) => ['reservado', 'emitido', 'abordado'].includes(b.estado)).length;
    return {
        abordados: contar('abordado'),
        porAbordar: contar('emitido'),
        sinPagar: contar('reservado'),
        libres: Math.max(0, Number(asientos || 0) - ocupados)
    };
}

/**
 * Opciones del combo "Parada donde sube": el origen y las paradas de la
 * frecuencia (en orden). El destino no es una parada de subida.
 */
export function opcionesParada(viaje) {
    if (!viaje) return [];
    const paradas = [...(viaje.paradas ?? [])]
        .sort((a, b) => Number(a.orden) - Number(b.orden))
        .map((p) => ({
            codigo: String(p.id),
            nombre: p.hora_estimada ? `${p.nombre} (${String(p.hora_estimada).slice(0, 5)})` : p.nombre
        }));
    return [{ codigo: 'origen', nombre: `${viaje.origen} (origen)` }, ...paradas];
}

/** Error del combo de la parada ('' si está bien). */
export function revisarParada(valor, opciones = []) {
    if (!valor) return 'Elige la parada donde sube el pasajero.';
    if (!opciones.some((o) => o.codigo === valor)) return 'Esa parada no pertenece a la ruta. Actualiza la página.';
    return '';
}

/**
 * Recaudación en camino (solo boletos EN_RUTA): pasajeros, total en
 * efectivo y detalle por tarifa. Se suma en centavos.
 * @param {{tarifa: string, precio: number}[]} lineas
 */
export function resumenRecaudacion(lineas = []) {
    const porTarifa = new Map();
    let totalC = 0;

    lineas.forEach((l) => {
        const centavos = Math.round(Number(l.precio || 0) * 100);
        totalC += centavos;
        const clave = l.tarifa ?? l.tipo ?? '—';
        const actual = porTarifa.get(clave) ?? { tarifa: clave, pasajeros: 0, centavos: 0 };
        actual.pasajeros += 1;
        actual.centavos += centavos;
        porTarifa.set(clave, actual);
    });

    return {
        pasajeros: lineas.length,
        total: totalC / 100,
        porTarifa: [...porTarifa.values()]
            .map(({ tarifa, pasajeros, centavos }) => ({ tarifa, pasajeros, total: centavos / 100 }))
            .sort((a, b) => b.pasajeros - a.pasajeros || a.tarifa.localeCompare(b.tarifa, 'es'))
    };
}

/** Máximo de días de los reportes (igual que la base, _revisar_rango_fechas). */
export const MAX_DIAS_REPORTE = 92;

/**
 * Errores del rango de fechas de un reporte ('' en cada campo si está bien).
 * @returns {{desde: string, hasta: string}}
 */
export function revisarRangoFechas(desde, hasta) {
    const errores = { desde: '', hasta: '' };
    if (!desde) errores.desde = 'Indica la fecha desde.';
    if (!hasta) errores.hasta = 'Indica la fecha hasta.';
    if (errores.desde || errores.hasta) return errores;

    if (desde > hasta) {
        errores.hasta = 'La fecha hasta no puede ser anterior a la fecha desde.';
        return errores;
    }

    const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000;
    if (dias > MAX_DIAS_REPORTE) errores.hasta = `Elige un rango de hasta ${MAX_DIAS_REPORTE} días.`;
    return errores;
}

/* ---------- Cambio 4, parte 4.4: hoja de ruta automática ---------- */

/** Días hacia adelante que la tarea nocturna deja generados (hoy + 6). */
export const DIAS_HOJA_AUTOMATICA = 6;

/** "dd/mm/aaaa HH:MM" en hora de Ecuador. */
export function fechaHoraEcuador(marca) {
    const fecha = new Date(marca);
    if (!marca || Number.isNaN(fecha.getTime())) return '';
    const dia = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Guayaquil', day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(fecha);
    return `${dia} ${horaEcuador(fecha)}`;
}

/**
 * Aviso de la generación automática de un grupo, o null si no tiene.
 * @param {{nombre?: string, aviso_hoja_ruta?: string|null, aviso_hoja_ruta_en?: string|null}} grupo
 * @returns {{titulo: string, texto: string, cuando: string} | null}
 */
export function avisoHojaRuta(grupo) {
    const texto = String(grupo?.aviso_hoja_ruta ?? '').trim();
    if (!texto) return null;

    const cuando = fechaHoraEcuador(grupo.aviso_hoja_ruta_en);
    return {
        titulo: grupo.nombre ? `Grupo ${grupo.nombre}` : 'Hoja de ruta automática',
        texto,
        cuando: cuando ? `Revisado el ${cuando}.` : ''
    };
}

/** Grupos con aviso, ordenados por nombre. */
export function gruposConAviso(grupos = []) {
    return grupos
        .filter((g) => avisoHojaRuta(g))
        .sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es'));
}

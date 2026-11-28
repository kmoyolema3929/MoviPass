// frontend/js/destacadas.js
// Frecuencias destacadas y banners de publicidad (cambio 5). Sin DOM ni
// Supabase: se prueba con node --test (tests/destacadas.test.cjs).
// Las mismas reglas están en la base (trigger frecuencias_destacada,
// marcar_frecuencia_destacada, banners_inicio y destacadas_inicio); aquí solo
// sirven para avisar antes y deshabilitar la estrella.

/** Día 0 del orden rotativo (el mismo que usa destacadas_inicio()). */
export const DIA_BASE = '2026-01-01';

export const IMAGEN_BANNER = {
    bucket: 'publicidad',
    tipos: ['image/jpeg', 'image/png', 'image/webp'],
    extensiones: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
    maxBytes: 2 * 1024 * 1024,
    ancho: 1200,
    alto: 400
};

/** Fecha de hoy en Ecuador (America/Guayaquil) como "AAAA-MM-DD". */
export function fechaHoyEcuador(ahora = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(ahora);
}

const esFecha = valor => /^\d{4}-\d{2}-\d{2}$/.test(String(valor ?? ''))
    && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));

/** "2026-11-05" -> "05/11/2026" */
export function fechaCorta(fechaISO) {
    const [y, m, d] = String(fechaISO).slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
}

/** Días enteros desde DIA_BASE hasta fechaISO (negativo si es antes). */
export function diasDesdeBase(fechaISO) {
    return Math.round((Date.parse(`${fechaISO}T00:00:00Z`) - Date.parse(`${DIA_BASE}T00:00:00Z`)) / 86400000);
}

/* ---------- Cupo y vigencia ---------- */

/** Vigencia vencida: hay fecha de fin y ya pasó (el último día todavía vale). */
export function vigenciaVencida(hasta, hoy) {
    return Boolean(hasta) && String(hasta).slice(0, 10) < hoy;
}

/** Frecuencias destacadas (de una cooperativa, si se indica). */
export function contarUsadas(frecuencias, cooperativaId = null) {
    return (frecuencias ?? []).filter(f =>
        f.destacada && (cooperativaId === null || f.cooperativa_id === cooperativaId)).length;
}

/**
 * Resumen del cupo de una cooperativa para el contador y los avisos.
 * @param {{cupo_destacadas?: number, destacadas_hasta?: string|null, estado?: string}} cooperativa
 */
export function estadoCupo(cooperativa, usadas, hoy) {
    const cupo = Number(cooperativa?.cupo_destacadas ?? 0);
    const hasta = cooperativa?.destacadas_hasta ?? null;
    const vencida = vigenciaVencida(hasta, hoy);
    const suspendida = (cooperativa?.estado ?? 'activa') !== 'activa';

    let aviso = '';
    if (suspendida) aviso = 'La cooperativa está suspendida: no puede destacar frecuencias nuevas.';
    else if (cupo === 0) aviso = 'Tu cupo es 0: solicita frecuencias destacadas al administrador.';
    else if (vencida) aviso = `Tu periodo de frecuencias destacadas venció el ${fechaCorta(hasta)}: solicita la renovación al administrador. Tus destacadas no se muestran en la portada.`;
    else if (usadas > cupo) aviso = `Tienes ${usadas} destacadas y tu cupo es ${cupo}: desmarca ${usadas - cupo}.`;
    else if (usadas >= cupo) aviso = 'Tu cupo está lleno: desmarca una frecuencia o solicita más cupo al administrador.';

    return {
        cupo,
        usadas,
        libres: Math.max(0, cupo - usadas),
        lleno: usadas >= cupo,
        vencida,
        suspendida,
        texto: `Destacadas: ${usadas} de ${cupo}`,
        vigencia: hasta ? `${vencida ? 'Venció' : 'Vigente hasta'} el ${fechaCorta(hasta)}` : 'Sin fecha de fin',
        aviso
    };
}

/**
 * ¿Puede este rol marcar o desmarcar la frecuencia?
 * @returns {{permitido: boolean, accion: 'marcar'|'desmarcar', motivo: string}}
 */
export function puedeDestacar({ rol, frecuencia, cooperativa, usadas, hoy }) {
    const accion = frecuencia?.destacada ? 'desmarcar' : 'marcar';
    const no = motivo => ({ permitido: false, accion, motivo });

    if (accion === 'desmarcar') {
        if (rol === 'cooperativa' || rol === 'administrador') return { permitido: true, accion, motivo: '' };
        return no('Solo el gerente puede cambiar las frecuencias destacadas.');
    }

    if (rol === 'administrador') return no('El administrador solo puede quitar el destacado de una frecuencia.');
    if (rol !== 'cooperativa') return no('Solo el gerente puede cambiar las frecuencias destacadas.');
    if (!frecuencia?.activa) return no('Activa la frecuencia para poder destacarla.');

    const estado = estadoCupo(cooperativa, usadas, hoy);
    if (estado.suspendida) return no(estado.aviso);
    if (estado.cupo === 0) return no('Tu cupo es 0: solicita frecuencias destacadas al administrador.');
    if (estado.vencida) return no(`Tu periodo de frecuencias destacadas venció el ${fechaCorta(cooperativa.destacadas_hasta)}: solicita la renovación al administrador.`);
    if (estado.lleno) return no(`Ya usas tus ${estado.cupo} frecuencias destacadas: desmarca una o solicita más cupo al administrador.`);

    return { permitido: true, accion, motivo: '' };
}

/** Errores del formulario de cupo del administrador ({} si está bien). */
export function revisarCupo({ cupo, hasta }, usadas = 0) {
    const errores = {};
    const texto = String(cupo ?? '').trim();

    if (texto === '') errores.cupo = 'Escribe el cupo (0 o más).';
    else if (!/^\d+$/.test(texto) || Number(texto) > 999) errores.cupo = 'El cupo debe ser un número entero entre 0 y 999.';
    else if (Number(texto) < usadas) {
        errores.cupo = `La cooperativa tiene ${usadas} frecuencias destacadas: el gerente debe desmarcar ${usadas - Number(texto)} antes de bajar el cupo a ${Number(texto)}.`;
    }

    if (hasta && !esFecha(hasta)) errores.hasta = 'Escribe una fecha válida o déjala vacía.';

    return errores;
}

/* ---------- Banners ---------- */

/** El banner sale hoy: activo y hoy dentro de [fecha_inicio, fecha_fin]. */
export function bannerVigente(banner, hoy) {
    return Boolean(banner?.activo)
        && String(banner.fecha_inicio) <= hoy
        && hoy <= String(banner.fecha_fin);
}

/** Estado del banner para la tabla del administrador. */
export function estadoBanner(banner, hoy) {
    if (!banner.activo) return 'Inactivo';
    if (hoy < banner.fecha_inicio) return 'Programado';
    if (hoy > banner.fecha_fin) return 'Terminado';
    return 'Publicado';
}

/** Revisa el archivo de imagen. Devuelve el mensaje de error o ''. */
export function validarImagen(archivo) {
    if (!archivo) return 'Elige la imagen del banner.';
    if (!IMAGEN_BANNER.tipos.includes(archivo.type)) return 'La imagen debe ser JPG, PNG o WEBP.';
    if (archivo.size > IMAGEN_BANNER.maxBytes) return 'La imagen pesa más de 2 MB. Redúcela e inténtalo de nuevo.';
    return '';
}

/** Aviso (no bloquea) si la imagen no tiene la proporción recomendada 3:1. */
export function avisoMedidas(ancho, alto) {
    if (!ancho || !alto) return '';
    const proporcion = ancho / alto;
    if (Math.abs(proporcion - 3) > 0.3 || ancho < 900) {
        return `La imagen mide ${ancho}×${alto}. Se recomienda 1200×400 para que no se recorte.`;
    }
    return '';
}

/**
 * Errores del formulario de banner ({} si está bien).
 * @param {{titulo, enlace, orden, fechaInicio, fechaFin}} v
 * @param {{hoy: string, nuevo: boolean, archivo?: any, tieneImagen?: boolean}} o
 */
export function revisarBanner(v, { hoy, nuevo, archivo = null, tieneImagen = false }) {
    const errores = {};
    const titulo = String(v.titulo ?? '').trim();
    const enlace = String(v.enlace ?? '').trim();
    const orden = String(v.orden ?? '').trim();

    if (!titulo) errores.titulo = 'Escribe el título del banner.';
    else if (titulo.length < 3 || titulo.length > 120) errores.titulo = 'El título debe tener entre 3 y 120 caracteres.';

    if (archivo) {
        const error = validarImagen(archivo);
        if (error) errores.imagen = error;
    } else if (!tieneImagen) {
        errores.imagen = 'Elige la imagen del banner.';
    }

    if (enlace && (!/^https:\/\/\S+\.\S+$/.test(enlace) || enlace.length > 500)) {
        errores.enlace = 'El enlace debe empezar con https:// (o déjalo vacío).';
    }

    if (orden && (!/^\d+$/.test(orden) || Number(orden) > 999)) errores.orden = 'El orden debe ser un número entero entre 0 y 999.';

    if (!esFecha(v.fechaInicio)) errores.fechaInicio = 'Elige la fecha de inicio.';
    if (!esFecha(v.fechaFin)) errores.fechaFin = 'Elige la fecha de fin.';
    else if (esFecha(v.fechaInicio) && v.fechaFin < v.fechaInicio) errores.fechaFin = 'La fecha de fin no puede ser anterior a la de inicio.';
    else if (nuevo && v.fechaFin < hoy) errores.fechaFin = 'La fecha de fin ya pasó: el banner nunca se mostraría.';

    return errores;
}

/** Fila para guardar en publicidad_banners. */
export function datosBanner(v) {
    return {
        titulo: String(v.titulo).trim(),
        enlace: String(v.enlace ?? '').trim() || null,
        cooperativa_id: v.cooperativaId || null,
        orden: Number(String(v.orden ?? '').trim() || 0),
        activo: v.activo === true || v.activo === 'true',
        fecha_inicio: v.fechaInicio,
        fecha_fin: v.fechaFin
    };
}

/** Ruta del archivo dentro del bucket a partir de su URL pública ('' si no es del bucket). */
export function rutaDesdeUrl(url) {
    const marca = `/storage/v1/object/public/${IMAGEN_BANNER.bucket}/`;
    const i = String(url ?? '').indexOf(marca);
    return i === -1 ? '' : decodeURIComponent(String(url).slice(i + marca.length).split('?')[0]);
}

/** Nombre del archivo nuevo: id único + extensión según el tipo. */
export function rutaImagen(id, tipo) {
    return `${id}.${IMAGEN_BANNER.extensiones[tipo] ?? 'jpg'}`;
}

/**
 * Nuevo orden (0..n-1) al subir o bajar un banner. Devuelve los cambios
 * [{id, orden}] o null si no se puede mover.
 */
export function moverBanner(banners, id, direccion) {
    const lista = [...banners].sort((a, b) => a.orden - b.orden || String(a.creado_en).localeCompare(String(b.creado_en)));
    const i = lista.findIndex(b => b.id === id);
    const j = i + direccion;
    if (i === -1 || j < 0 || j >= lista.length) return null;

    [lista[i], lista[j]] = [lista[j], lista[i]];
    return lista
        .map((b, posicion) => ({ id: b.id, orden: posicion, antes: b.orden }))
        .filter(b => b.orden !== b.antes)
        .map(({ id: idBanner, orden }) => ({ id: idBanner, orden }));
}

/* ---------- Orden rotativo diario ---------- */

const compararIds = (a, b) => (typeof a === 'number' && typeof b === 'number')
    ? a - b
    : String(a).localeCompare(String(b), 'en', { numeric: true });

/**
 * Orden de la portada: por id y desplazado un puesto por día. El día d
 * (días desde DIA_BASE, fecha de Ecuador) sale primera la de posición d mod n,
 * así cada una sale primera un día de cada n. Igual que destacadas_inicio().
 */
export function ordenRotativo(elementos, hoy, id = e => e.id) {
    const lista = [...(elementos ?? [])].sort((a, b) => compararIds(id(a), id(b)));
    const n = lista.length;
    if (n === 0) return [];

    const k = ((diasDesdeBase(hoy) % n) + n) % n;
    return [...lista.slice(k), ...lista.slice(0, k)];
}

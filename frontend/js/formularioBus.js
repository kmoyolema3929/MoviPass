// frontend/js/formularioBus.js
// Registro de buses (cambio 6, parte 3): reglas del formulario, sin DOM ni
// Supabase, para usarlas en el formulario de un bus y en el lote, y probarlas
// con node --test. La base repite estas reglas (trigger buses_validar).

import { normalizarPlaca } from './validaciones.js';

export const LIMITES_BUS = { numeroInterno: 10, dueno: 120, marcaOtra: 60, chasis: 50 };

export const FOTO = {
    bucket: 'fotos-buses',
    tipos: ['image/jpeg', 'image/png', 'image/webp'],
    maximo: 2 * 1024 * 1024
};

/** Opción del combo de plantillas que abre el editor para crear una nueva. */
export const CREAR_PLANTILLA = '__crear__';

const limpiar = texto => String(texto ?? '').trim().replace(/\s+/g, ' ');

/** "  12 a " -> "12 A" (igual que la base). */
export function normalizarNumeroInterno(texto) {
    return limpiar(texto).toUpperCase();
}

/** ¿La marca elegida es "Otro"? (entonces se escribe el nombre a mano). */
export function esMarcaOtro(marcas, id) {
    const marca = (marcas ?? []).find(m => String(m.id) === String(id));
    return Boolean(marca) && marca.nombre.trim().toLowerCase() === 'otro';
}

/** Problema de una foto elegida ('' si está bien): solo JPG, PNG o WebP de hasta 2 MB. */
export function validarFoto(archivo) {
    if (!archivo) return '';
    if (!FOTO.tipos.includes(archivo.type)) return 'La foto debe ser una imagen JPG, PNG o WebP.';
    if (archivo.size > FOTO.maximo) return 'La foto pesa más de 2 MB. Elige una más liviana.';
    return '';
}

/** Ruta de la foto en el bucket: <cooperativa>/<bus>-<marca de tiempo>.<extensión>. */
export function rutaFoto(cooperativaId, busId, archivo, ahora = Date.now()) {
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[archivo.type] ?? 'jpg';
    return `${cooperativaId}/${busId}-${ahora}.${extension}`;
}

/**
 * Revisa los datos de un bus. Devuelve { campo: problema } (vacío si está bien).
 * valores: { numeroInterno, placa, dueno, grupoId, plantillaId, marcaCarroceriaId,
 *            marcaCarroceriaOtra, marcaChasisId, marcaChasisOtra, chasis }
 * contexto: { buses, idActual, marcasCarroceria, marcasChasis }
 */
export function revisarBus(valores, contexto = {}) {
    const { buses = [], idActual = '', marcasCarroceria = [], marcasChasis = [] } = contexto;
    const errores = {};
    const otros = buses.filter(bus => bus.id !== idActual);

    const numero = normalizarNumeroInterno(valores.numeroInterno);
    if (!numero) {
        errores.numeroInterno = 'Escribe el número interno.';
    } else if (numero.length > LIMITES_BUS.numeroInterno) {
        errores.numeroInterno = `Máximo ${LIMITES_BUS.numeroInterno} caracteres.`;
    } else if (otros.some(bus => String(bus.numero_interno ?? '').toUpperCase() === numero)) {
        errores.numeroInterno = 'Ya tienes un bus con ese número interno.';
    }

    const placa = normalizarPlaca(valores.placa);
    if (!placa.placa) {
        errores.placa = 'Escribe la placa.';
    } else if (!placa.valida) {
        errores.placa = 'Formato de placa no válido. Usa 3 letras y 4 números, por ejemplo ABC-1234.';
    } else if (otros.some(bus => bus.placa === placa.placa)) {
        errores.placa = 'Ya existe un bus con esta placa.';
    }

    const dueno = limpiar(valores.dueno);
    if (dueno.length < 2) errores.dueno = 'Escribe el dueño o socio (mínimo 2 caracteres).';
    else if (dueno.length > LIMITES_BUS.dueno) errores.dueno = `Máximo ${LIMITES_BUS.dueno} caracteres.`;

    if (!valores.grupoId) errores.grupoId = 'Elige el grupo del bus.';

    if (!valores.plantillaId || valores.plantillaId === CREAR_PLANTILLA) {
        errores.plantillaId = 'Elige la plantilla de asientos.';
    }

    if (!valores.marcaCarroceriaId) {
        errores.marcaCarroceriaId = 'Elige la marca de carrocería.';
    } else if (esMarcaOtro(marcasCarroceria, valores.marcaCarroceriaId)) {
        const otra = limpiar(valores.marcaCarroceriaOtra);
        if (!otra) errores.marcaCarroceriaOtra = 'Escribe la marca de carrocería.';
        else if (otra.length > LIMITES_BUS.marcaOtra) errores.marcaCarroceriaOtra = `Máximo ${LIMITES_BUS.marcaOtra} caracteres.`;
    }

    if (valores.marcaChasisId && esMarcaOtro(marcasChasis, valores.marcaChasisId)) {
        const otra = limpiar(valores.marcaChasisOtra);
        if (!otra) errores.marcaChasisOtra = 'Escribe la marca de chasis.';
        else if (otra.length > LIMITES_BUS.marcaOtra) errores.marcaChasisOtra = `Máximo ${LIMITES_BUS.marcaOtra} caracteres.`;
    }

    if (limpiar(valores.chasis).length > LIMITES_BUS.chasis) {
        errores.chasis = `Máximo ${LIMITES_BUS.chasis} caracteres.`;
    }

    return errores;
}

/** Columnas de public.buses a partir de los valores del formulario (ya revisados). */
export function datosDelBus(valores, contexto = {}) {
    const { marcasCarroceria = [], marcasChasis = [] } = contexto;
    const entero = valor => (valor ? Number(valor) : null);
    const texto = valor => limpiar(valor) || null;

    return {
        numero_interno: normalizarNumeroInterno(valores.numeroInterno),
        placa: normalizarPlaca(valores.placa).placa,
        dueno: limpiar(valores.dueno),
        grupo_id: valores.grupoId,
        plantilla_id: valores.plantillaId,
        marca_carroceria_id: entero(valores.marcaCarroceriaId),
        marca_carroceria_otra: esMarcaOtro(marcasCarroceria, valores.marcaCarroceriaId) ? texto(valores.marcaCarroceriaOtra) : null,
        marca_chasis_id: entero(valores.marcaChasisId),
        marca_chasis_otra: esMarcaOtro(marcasChasis, valores.marcaChasisId) ? texto(valores.marcaChasisOtra) : null,
        chasis: texto(valores.chasis),
        usuario_bus_id: valores.usuarioBusId || null
    };
}

/** Mensaje claro para los errores de la base al guardar o eliminar un bus. */
export function mensajeErrorBus(error, accion = 'guardar') {
    const texto = `${error?.message ?? ''} ${error?.details ?? ''}`;

    switch (error?.code) {
        case '23505':
            return /numero_interno/i.test(texto)
                ? 'Ya tienes un bus con ese número interno.'
                : 'Ya existe un bus con esta placa.';

        case '55006': // boletos vendidos que quedarían sin asiento o en otro lugar
            return error.message;

        case '23503':
            if (accion === 'eliminar') {
                return 'No se puede eliminar el bus porque tiene registros relacionados (hojas de ruta o boletos).';
            }
            if (/grupo/i.test(texto)) return 'El grupo elegido ya no está disponible. Recarga la página.';
            if (/plantilla/i.test(texto)) return 'La plantilla elegida ya no está disponible. Recarga la página.';
            if (/usuario bus/i.test(texto)) return error.message;
            return 'La cooperativa ya no está disponible. Recarga la página.';

        case '23502': // dato obligatorio (mensaje de la base en español)
            return error.message || 'Revisa los campos obligatorios.';

        case '42501':
            return 'No tienes permisos para realizar esta operación.';

        case 'PGRST116':
            return 'El bus ya no está disponible o tus permisos cambiaron. Recarga la página.';

        case '23514':
        case '22001':
            return 'Revisa los campos obligatorios y la longitud de los datos.';

        default:
            return `No se pudo ${accion} el bus. Revisa tu conexión e inténtalo nuevamente.`;
    }
}

/** Nombre de la marca para mostrar ("Otro" muestra el texto escrito). */
export function nombreMarca(marcas, id, otra) {
    if (!id) return '';
    if (otra) return otra;
    return (marcas ?? []).find(m => String(m.id) === String(id))?.nombre ?? '';
}

// frontend/js/erroresBase.js
// Mensajes claros cuando la base de datos rechaza algo (cambio 3), en lugar
// de errores técnicos. Sin DOM ni Supabase (se prueba con node --test).
//
// Las funciones de la base escriben sus mensajes en español con estos códigos:
//   23505 repetido, 23514 dato no válido, 23503 en uso, 42501 sin permiso,
//   22023 valor no válido. Esos mensajes se muestran tal cual.

const PROPIOS = new Set(['23505', '23514', '23503', '22023', 'P0001']);

/** El texto parece un mensaje técnico (inglés, nombres de tablas o restricciones). */
function esTecnico(texto) {
    return /violates|constraint|relation|column|syntax|null value|duplicate key|function .*does not exist|permission denied|JWT|PGRST/i.test(texto);
}

/** Mensaje escrito en español (tildes, eñes o palabras frecuentes). */
function esEspanol(texto) {
    return /[áéíóúñ¿¡]|\b(la|el|los|las|del|tu|para|con|que|debes)\b/i.test(texto)
        && !/\b(the|is|not found|failed|error|invalid|already|must)\b/i.test(texto);
}

/**
 * @param {any} error Error de supabase-js (code, message) o de fetch.
 * @param {string} [accion] Qué se intentaba ("guardar el perfil").
 */
export function mensajeErrorBase(error, accion = 'completar la operación') {
    const codigo = String(error?.code ?? '');
    const texto = String(error?.message ?? '');

    if (error?.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|load failed|network request failed/i.test(texto)) {
        return 'No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.';
    }

    if (codigo === 'PGRST202' || /could not find the function|schema cache/i.test(texto)) {
        return 'Falta aplicar una migración de la base de datos. Avisa al administrador.';
    }

    if (codigo === '23505') {
        return texto && !esTecnico(texto) ? texto : 'Ese dato ya está registrado.';
    }

    if (codigo === '42501') {
        return texto && !esTecnico(texto) ? texto : 'Tu cuenta no tiene permiso para hacer esto.';
    }

    if (PROPIOS.has(codigo) && texto && !esTecnico(texto)) return texto;

    if (codigo === '23514' || codigo === '22023' || codigo === '23502') {
        return 'Algún dato no es válido. Revisa el formulario.';
    }

    if (codigo === '23503') return 'No se puede hacer porque el registro está en uso.';

    // Errores que lanza la propia aplicación (sin código y en español).
    if (!codigo && texto && !esTecnico(texto) && esEspanol(texto)) return texto;

    return `No se pudo ${accion}. Inténtalo de nuevo en unos minutos.`;
}

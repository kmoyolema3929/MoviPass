import { supabase } from "./supabaseClient.js";

// Cooperativas que el usuario puede gestionar:
// el administrador ve todas; la cooperativa solo las que tiene asignadas.
export async function obtenerCooperativasPermitidas(rol) {
    if (rol === "administrador") {
        const { data, error } = await supabase
            .from("cooperativas")
            .select("id, nombre")
            .order("nombre");

        if (error) throw error;

        return data ?? [];
    }

    const { data: sesion, error: errorSesion } =
        await supabase.auth.getUser();

    const usuario = sesion?.user;

    if (errorSesion || !usuario) {
        throw errorSesion ?? new Error("No hay una sesión activa.");
    }

    const { data, error } = await supabase
        .from("cooperativas_usuarios")
        .select("cooperativas(id, nombre)")
        .eq("perfil_id", usuario.id);

    if (error) throw error;

    return (data ?? [])
        .map(fila => fila.cooperativas)
        .filter(Boolean)
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// Buses de UNA cooperativa. Se filtra siempre por cooperativa_id.
export async function obtenerBusesDeCooperativa(cooperativaId) {
    if (!cooperativaId) return [];

    const { data, error } = await supabase
        .from("buses")
        .select("id, placa, tipo_bus, plantilla_id")
        .eq("cooperativa_id", cooperativaId)
        .order("placa");

    if (error) throw error;

    return data ?? [];
}

// Convierte una fila de plantillas_bus (con sus asientos) en pisos.
function convertirPlantilla(fila) {
    if (
        !Array.isArray(fila.distribucion) ||
        !Array.isArray(fila.asientos) ||
        fila.distribucion.length !== fila.numero_pisos ||
        fila.asientos.length !== fila.total_asientos ||
        !fila.actualizado_en
    ) {
        throw new Error(
            "La plantilla de «" + fila.tipo_bus + "» está incompleta."
        );
    }

    const pisos = fila.distribucion.map(function (piso, indice) {
        const numero = indice + 1;

        const asientos = fila.asientos
            .filter(asiento => asiento.piso === numero)
            .sort((a, b) => a.numero - b.numero);

        if (
            !Number.isInteger(piso.cantidad) ||
            asientos.length !== piso.cantidad
        ) {
            throw new Error(
                "Los asientos guardados de «" + fila.tipo_bus +
                "» no coinciden con su distribución."
            );
        }

        return {
            numero,
            filas: piso.filas,
            columnas: piso.columnas,
            ultima_fila_5: piso.ultima_fila_5 === true,
            asientos
        };
    });

    return {
        id: fila.id,
        cooperativa_id: fila.cooperativa_id,
        // null = plantilla del tipo; con valor = plantilla propia de ese bus.
        bus_id: fila.bus_id ?? null,
        tipo_bus: fila.tipo_bus,
        numero_pisos: fila.numero_pisos,
        total_asientos: fila.total_asientos,
        // Se conserva el texto original, con su precisión.
        actualizado_en: fila.actualizado_en,
        pisos
    };
}

// Plantillas de UNA cooperativa: una por tipo de bus y, opcionalmente,
// una propia por cada bus con distribución especial.
export async function obtenerPlantillasDeCooperativa(cooperativaId) {
    if (!cooperativaId) return [];

    const { data, error } = await supabase
        .from("plantillas_bus")
        .select(`
            id,
            cooperativa_id,
            bus_id,
            tipo_bus,
            numero_pisos,
            total_asientos,
            distribucion,
            actualizado_en,
            asientos:plantilla_asientos(
                numero, piso, fila, columna, tipo
            )
        `)
        .eq("cooperativa_id", cooperativaId)
        .order("tipo_bus");

    if (error) throw error;

    return (data ?? []).map(convertirPlantilla);
}

// Convierte la configuración de la vista previa en la distribución
// que espera la base de datos. La base genera los asientos.
function armarDistribucion(configuracion) {
    if (
        !configuracion?.tipo_bus ||
        !Array.isArray(configuracion.pisos) ||
        configuracion.pisos.length === 0 ||
        configuracion.pisos.some(piso => !Array.isArray(piso.asientos))
    ) {
        throw new Error("Genera una vista previa válida antes de guardar.");
    }

    return configuracion.pisos.map(function (piso) {
        return {
            cantidad: piso.asientos.length,
            filas: piso.filas,
            columnas: piso.columnas,
            ultima_fila_5: piso.ultima_fila_5 === true
        };
    });
}

// Guarda la plantilla del tipo de bus y la asigna a los buses de ese
// tipo que no tengan plantilla propia.
export async function guardarPlantillaDeTipo(
    cooperativaId,
    configuracion,
    actualizadoEnEsperado = null
) {
    if (!cooperativaId) {
        throw new Error("Genera una vista previa válida antes de guardar.");
    }

    const { data, error } = await supabase.rpc("guardar_plantilla_bus", {
        p_cooperativa_id: cooperativaId,
        p_tipo_bus: configuracion?.tipo_bus,
        p_distribucion: armarDistribucion(configuracion),
        p_actualizado_en_esperado: actualizadoEnEsperado
    });

    // El código del error se conserva para manejar permisos y conflictos.
    if (error) throw error;

    return data;
}

// Guarda una plantilla propia para UN solo bus.
export async function guardarPlantillaIndividual(
    cooperativaId,
    busId,
    configuracion,
    actualizadoEnEsperado = null
) {
    if (!cooperativaId || !busId) {
        throw new Error("Elige el bus antes de guardar.");
    }

    const { data, error } = await supabase.rpc("guardar_plantilla_individual", {
        p_cooperativa_id: cooperativaId,
        p_bus_id: busId,
        p_distribucion: armarDistribucion(configuracion),
        p_actualizado_en_esperado: actualizadoEnEsperado
    });

    if (error) throw error;

    return data;
}

// Quita la plantilla propia: el bus vuelve a usar la de su tipo.
export async function quitarPlantillaIndividual(cooperativaId, busId) {
    if (!cooperativaId || !busId) {
        throw new Error("Elige el bus antes de continuar.");
    }

    const { data, error } = await supabase.rpc("quitar_plantilla_individual", {
        p_cooperativa_id: cooperativaId,
        p_bus_id: busId
    });

    if (error) throw error;

    return data;
}
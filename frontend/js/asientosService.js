import { supabase } from "./supabaseClient.js";

// Recupera la plantilla y sus asientos en una sola consulta.
export async function obtenerPlantillaGuardada(busId) {
    if (!busId) {
        throw new Error("Selecciona un bus para cargar su plantilla.");
    }

    const { data, error } = await supabase
        .from("plantillas_asientos")
        .select(`
            id,
            bus_id,
            numero_pisos,
            total_asientos,
            distribucion,
            actualizado_en,
            asientos:asientos!asientos_plantilla_fkey(
                id, numero, piso, fila, columna, tipo
            )
        `)
        .eq("bus_id", busId)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    if (
        !Array.isArray(data.distribucion) ||
        !Array.isArray(data.asientos) ||
        data.distribucion.length !== data.numero_pisos ||
        data.asientos.length !== data.total_asientos ||
        !data.actualizado_en
    ) {
        throw new Error(
            "La plantilla guardada está incompleta. Vuelve a cargar el bus."
        );
    }

    const pisos = data.distribucion.map(function (piso, indice) {
        const asientos = data.asientos
            .filter(asiento => asiento.piso === piso.numero)
            .sort((a, b) => a.numero - b.numero);

        if (
            piso.numero !== indice + 1 ||
            !Number.isInteger(piso.cantidad) ||
            piso.cantidad < 1 ||
            asientos.length !== piso.cantidad
        ) {
            throw new Error(
                "Los asientos guardados no coinciden con la distribución."
            );
        }

        return {
            numero: piso.numero,
            filas: piso.filas,
            columnas: piso.columnas,
            asientos
        };
    });

    const total = pisos.reduce(
        (suma, piso) => suma + piso.asientos.length,
        0
    );

    if (total !== data.total_asientos) {
        throw new Error("No se pudieron recuperar todos los asientos.");
    }

    return {
        id: data.id,
        bus_id: data.bus_id,
        numero_pisos: data.numero_pisos,
        total_asientos: data.total_asientos,
        // Conservar el texto original, incluida su precisión.
        actualizado_en: data.actualizado_en,
        pisos
    };
}

// Envía la distribución; Supabase genera los números y tipos de asiento.
export async function guardarPlantillaEnSupabase(
    configuracion,
    actualizadoEnEsperado = null
) {
    if (
        !configuracion?.bus_id ||
        !Array.isArray(configuracion.pisos) ||
        configuracion.pisos.length === 0 ||
        configuracion.pisos.some(piso => !Array.isArray(piso.asientos))
    ) {
        throw new Error("Genera una vista previa válida antes de guardar.");
    }

    const distribucion = configuracion.pisos.map(function (piso) {
        return {
            cantidad: piso.asientos.length,
            filas: piso.filas,
            columnas: piso.columnas
        };
    });

    const { data, error } = await supabase.rpc(
        "guardar_plantilla_asientos",
        {
            p_bus_id: configuracion.bus_id,
            p_distribucion: distribucion,
            p_actualizado_en_esperado: actualizadoEnEsperado
        }
    );

    // Conservar el código original para manejar permisos y conflictos.
    if (error) throw error;

    return data;
}
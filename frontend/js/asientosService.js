import { supabase } from "./supabaseClient.js";
import { especialesPorPiso } from "./celdasEspeciales.js";

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

// Celdas especiales (baño, puerta, escalera, cabina, pasillo) de la plantilla
// que usa un bus, por número de piso. Las plantillas se gestionan en plantillas.js.
// Los mapas de venta las muestran bloqueadas.
export async function obtenerCeldasEspecialesDeBus(busId) {
    if (!busId) return new Map();

    const { data: bus, error } = await supabase
        .from("buses")
        .select("plantilla_id")
        .eq("id", busId)
        .maybeSingle();

    if (error) throw error;
    if (!bus?.plantilla_id) return new Map();

    const { data: plantilla, error: errorPlantilla } = await supabase
        .from("plantillas_bus")
        .select("distribucion")
        .eq("id", bus.plantilla_id)
        .maybeSingle();

    if (errorPlantilla) throw errorPlantilla;

    return especialesPorPiso(plantilla?.distribucion);
}

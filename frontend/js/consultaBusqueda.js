import { supabase } from './supabaseClient.js';

/**
 * Ciudades que tienen al menos una frecuencia activa.
 * Se usan para llenar los selectores de origen y destino.
 * @returns {Promise<string[]>}
 */
export async function obtenerCiudades() {
    const { data, error } = await supabase
        .from('frecuencias')
        .select('origen, destino')
        .eq('activa', true);

    if (error) throw error;

    const ciudades = new Set();

    for (const frecuencia of data ?? []) {
        if (frecuencia.origen) ciudades.add(String(frecuencia.origen).trim());
        if (frecuencia.destino) ciudades.add(String(frecuencia.destino).trim());
    }

    return [...ciudades]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'es'));
}

export async function buscarViajes({ origen, destino, fecha }) {
    const { data, error } = await supabase
        .from('viajes')
        .select(`
            id,
            fecha,
            precio,
            frecuencia:frecuencias!inner (
                origen,
                destino,
                hora
            ),
            bus:buses (
                id,
                tipo_bus,
                cooperativa:cooperativas (
                    id,
                    nombre
                )
            )
        `)
        .eq('frecuencia.origen', origen)
        .eq('frecuencia.destino', destino)
        .eq('fecha', fecha)
        // Cambio 4: solo viajes a la venta (no salieron según la hora de
        // Ecuador, ni están en curso o finalizados). Columna calculada
        // public.a_la_venta; la política de lectura aplica la misma regla.
        .eq('a_la_venta', true);

    if (error) {
        throw error;
    }

    return (data ?? [])
        .sort((a, b) => String(a.frecuencia?.hora ?? '').localeCompare(String(b.frecuencia?.hora ?? '')))
        .map((viaje) => {
            const frecuencia = viaje.frecuencia;
            const bus = viaje.bus;
            const cooperativa = bus?.cooperativa;

            if (!frecuencia || !bus || !cooperativa) {
                throw new Error(
                    'No se pudieron consultar los datos relacionados del viaje. Revisa los permisos de lectura de buses y cooperativas.'
                );
            }

            const precio = Number(viaje.precio);

            if (
                viaje.precio === null ||
                viaje.precio === '' ||
                !Number.isFinite(precio)
            ) {
                throw new Error('El viaje tiene un precio inválido.');
            }

            return {
                id: String(viaje.id),
                origen: frecuencia.origen,
                destino: frecuencia.destino,
                fecha: viaje.fecha,
                hora: frecuencia.hora,
                salidaEn: `${viaje.fecha}T${frecuencia.hora}-05:00`,
                precio,
                busId: String(bus.id),
                tipoBusNombre: bus.tipo_bus,
                cooperativaId: String(cooperativa.id),
                cooperativaNombre: cooperativa.nombre,
            };
        });
}
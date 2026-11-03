import { supabase } from './supabaseClient.js';

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
        .eq('fecha', fecha);

    if (error) {
        throw error;
    }

    return (data ?? []).map((viaje) => {
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
import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const tbody = document.getElementById('tablaHistorial');

    try {
        // 1. Obtener el usuario autenticado
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("No hay un usuario autenticado.");

        // 2. Consultar los pagos/boletos del usuario en Supabase
        const { data: boletos, error: dbError } = await supabase
            .from('pagos') // Nota: Si tu tabla se llama diferente, cámbialo aquí
            .select('*')
            .eq('usuario_id', user.id);

        if (dbError) throw dbError;

        // 3. Limpiar la tabla antes de renderizar
        tbody.replaceChildren();

        // 4. Validar si hay datos
        if (!boletos || boletos.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 5;
            td.className = 'text-center py-3 text-muted';
            td.textContent = 'No tienes boletos comprados aún.';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        // 5. Renderizar los boletos
        boletos.forEach((boleto, index) => {
            const tr = document.createElement('tr');

            // Columna #
            const tdIndex = document.createElement('td');
            tdIndex.textContent = index + 1;

            // Columna ID del Boleto (asumiendo que guardas un ID o usas el id de la tabla)
            const tdId = document.createElement('td');
            // Si en tu tabla 'pagos' no tienes un campo 'id_boleto', puedes usar el 'id' del pago
            tdId.textContent = boleto.id || 'BOL-DEMO';

            // Columna Fecha (usando created_at o la fecha que guardes)
            const tdFecha = document.createElement('td');
            tdFecha.textContent = new Date(boleto.created_at).toLocaleDateString();

            // Columna Estado
            const tdEstado = document.createElement('td');
            const badge = document.createElement('span');
            // Asumimos que el estado se guarda como 'pendiente' o 'pagado'
            badge.className = boleto.estado === 'pagado' ? 'badge bg-success' : 'badge bg-warning text-dark';
            badge.textContent = boleto.estado === 'pagado' ? 'Pagado' : 'Pendiente';
            tdEstado.appendChild(badge);

            // Columna Acciones
            const tdAcciones = document.createElement('td');
            tdAcciones.className = 'text-center';

            const btnVer = document.createElement('a');
            // Pasamos el ID del pago por la URL para que el boleto.html lo lea
            btnVer.href = `boleto.html?id=${boleto.id}`;
            btnVer.className = 'btn btn-sm btn-outline-primary me-1';
            btnVer.textContent = 'Ver Boleto';

            tdAcciones.appendChild(btnVer);

            // Armar la fila
            tr.appendChild(tdIndex);
            tr.appendChild(tdId);
            tr.appendChild(tdFecha);
            tr.appendChild(tdEstado);
            tr.appendChild(tdAcciones);
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('Error al cargar el historial:', error.message);
        tbody.replaceChildren();
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.className = 'text-center py-3 text-danger';
        td.textContent = 'Ocurrió un error al cargar tu historial. Por favor, intenta de nuevo más tarde.';
        tr.appendChild(td);
        tbody.appendChild(tr);
    }
});
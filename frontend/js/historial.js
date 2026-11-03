document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('tablaHistorial');

    // Simulamos datos del historial (en un futuro vendrán de Supabase)
    const boletos = [
        { id: 'BOL-555312', fecha: '26/10/2026', estado: 'Pagado' },
        { id: 'BOL-123456', fecha: '25/10/2026', estado: 'Pendiente' },
        { id: 'BOL-789012', fecha: '20/10/2026', estado: 'Pagado' }
    ];

    // Limpiar la tabla
    tbody.replaceChildren();

    if (boletos.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.className = 'text-center py-3 text-muted';
        td.textContent = 'No tienes boletos comprados aún.';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    boletos.forEach((boleto, index) => {
        const tr = document.createElement('tr');

        // Columna #
        const tdIndex = document.createElement('td');
        tdIndex.textContent = index + 1;

        // Columna ID del Boleto
        const tdId = document.createElement('td');
        tdId.textContent = boleto.id;

        // Columna Fecha
        const tdFecha = document.createElement('td');
        tdFecha.textContent = boleto.fecha;

        // Columna Estado
        const tdEstado = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = boleto.estado === 'Pagado' ? 'badge bg-success' : 'badge bg-warning text-dark';
        badge.textContent = boleto.estado;
        tdEstado.appendChild(badge);

        // Columna Acciones
        const tdAcciones = document.createElement('td');
        tdAcciones.className = 'text-center';

        const btnVer = document.createElement('a');
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
});
document.addEventListener('DOMContentLoaded', () => {
    const asientosGuardados = sessionStorage.getItem('asientosSeleccionados');
    if (!asientosGuardados) {
        alert('No has seleccionado asientos. Redirigiendo...');
        window.location.href = '../seleccion-asientos.html';
        return;
    }

    const asientos = JSON.parse(asientosGuardados);
    const PRECIO_ASIENTO = 12.5;

    document.getElementById('rutaViaje').textContent = 'Quito → Guayaquil';
    document.getElementById('fechaViaje').textContent = '26 de Octubre, 2026';
    document.getElementById('horaViaje').textContent = '08:00 AM';

    const lista = document.getElementById('listaAsientosResumen');
    const totalPagar = document.getElementById('totalPagar');
    lista.replaceChildren();
    let total = 0;

    asientos.forEach(asiento => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between px-0';
        const spanAsiento = document.createElement('span');
        spanAsiento.textContent = `Asiento ${asiento}`;
        const spanPrecio = document.createElement('span');
        spanPrecio.textContent = `$${PRECIO_ASIENTO.toFixed(2)}`;
        li.appendChild(spanAsiento);
        li.appendChild(spanPrecio);
        lista.appendChild(li);
        total += PRECIO_ASIENTO;
    });

    totalPagar.textContent = `$${total.toFixed(2)}`;
    
    const formPasajeros = document.getElementById('formPasajeros');
    
    formPasajeros.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Validación visual de Bootstrap
        if (!formPasajeros.checkValidity()) {
            e.stopPropagation();
            formPasajeros.classList.add('was-validated');
            return;
        }

        // Mensaje de confirmación al usuario
        alert('¡Datos de pasajeros registrados con éxito! Redirigiendo al pago...');
        
        // Aquí iría la redirección real al siguiente issue (#47)
        // window.location.href = 'pago.html';
    });
});
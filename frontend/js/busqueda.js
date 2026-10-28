const formulario = document.getElementById('form-busqueda');
const origen = document.getElementById('origen');
const destino = document.getElementById('destino');
const fecha = document.getElementById('fecha');
const erroresBusqueda = document.getElementById('errores-busqueda');

function obtenerFechaLocalHoy() {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');

    return `${anio}-${mes}-${dia}`;
}

fecha.min = obtenerFechaLocalHoy();

formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();

    const hoy = obtenerFechaLocalHoy();
    fecha.min = hoy;

    const errores = [];

    if (!origen.value) {
        errores.push('Selecciona una ciudad de origen.');
    }

    if (!destino.value) {
        errores.push('Selecciona una ciudad de destino.');
    }

    if (!fecha.value) {
        errores.push('Selecciona una fecha de viaje válida.');
    } else if (fecha.value < hoy) {
        errores.push('La fecha de viaje no puede ser anterior a hoy.');
    }

    if (origen.value && destino.value && origen.value === destino.value) {
        errores.push('El origen y el destino deben ser diferentes.');
    }

    erroresBusqueda.replaceChildren();
    erroresBusqueda.hidden = errores.length === 0;

    if (errores.length > 0) {
        const lista = document.createElement('ul');
        lista.className = 'mb-0';

        errores.forEach((mensaje) => {
            const elemento = document.createElement('li');
            elemento.textContent = mensaje;
            lista.appendChild(elemento);
        });

        erroresBusqueda.appendChild(lista);
        erroresBusqueda.focus();
        return;
    }

    // Acción temporal mientras se conecta Supabase.
    const nombreOrigen = origen.options[origen.selectedIndex].text;
    const nombreDestino = destino.options[destino.selectedIndex].text;

    alert(`Buscando viajes de ${nombreOrigen} a ${nombreDestino} para el día ${fecha.value}`);

    // Aquí irá la futura consulta a Supabase en el Issue #41.
});
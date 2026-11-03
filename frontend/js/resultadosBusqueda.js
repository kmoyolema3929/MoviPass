const formulario = document.getElementById('form-busqueda');
const seccion = document.getElementById('resultados-busqueda');
const estado = document.getElementById('estado-resultados');
const tarjetas = document.getElementById('tarjetas-viajes');

function crearElemento(etiqueta, clases, texto) {
    const elemento = document.createElement(etiqueta);
    elemento.className = clases;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
}

function crearTarjeta(viaje) {
    const columna = crearElemento('div', 'col-12 col-md-6 col-xl-4');
    const tarjeta = crearElemento('article', 'card h-100 shadow-sm');
    const cuerpo = crearElemento('div', 'card-body d-flex flex-column');
    cuerpo.appendChild(crearElemento('h3', 'h5 card-title text-break', viaje.cooperativaNombre));
    cuerpo.appendChild(crearElemento('p', 'card-text fw-semibold', `${viaje.origen} → ${viaje.destino}`));

    const datos = crearElemento('dl', 'row mb-3');
    const [anio, mes, dia] = viaje.fecha.split('-');
    for (const [nombre, valor] of [
        ['Fecha', `${dia}/${mes}/${anio}`],
        ['Hora de salida', viaje.hora.slice(0, 5)],
        ['Tipo de bus', viaje.tipoBusNombre],
        ['Precio por pasajero', `$${Number(viaje.precio).toFixed(2)} USD`],
    ]) {
        datos.appendChild(crearElemento('dt', 'col-6', nombre));
        datos.appendChild(crearElemento('dd', 'col-6 text-break', valor));
    }
    cuerpo.appendChild(datos);

    const enlace = crearElemento('a', 'btn btn-primary mt-auto', 'Seleccionar asientos');
    const parametros = new URLSearchParams({ viaje_id: viaje.id });
    enlace.href = `seleccion-asientos.html?${parametros}`;
    enlace.setAttribute('aria-label', `Seleccionar asientos: ${viaje.cooperativaNombre}, ${viaje.origen} a ${viaje.destino}, ${viaje.hora.slice(0, 5)}`);
    cuerpo.appendChild(enlace);
    tarjeta.appendChild(cuerpo);
    columna.appendChild(tarjeta);
    return columna;
}

formulario.addEventListener('busqueda:cargando', () => {
    seccion.hidden = false;
    seccion.setAttribute('aria-busy', 'true');
    tarjetas.replaceChildren();
    estado.textContent = 'Buscando viajes…';
});

formulario.addEventListener('busqueda:resultados', (evento) => {
    const viajes = evento.detail;
    seccion.hidden = false;
    seccion.removeAttribute('aria-busy');
    tarjetas.replaceChildren(...viajes.map(crearTarjeta));
    estado.textContent = viajes.length === 0
        ? 'No se encontraron viajes para el origen, destino y fecha seleccionados.'
        : `${viajes.length} ${viajes.length === 1 ? 'viaje encontrado' : 'viajes encontrados'}.`;
});

formulario.addEventListener('busqueda:error', () => {
    tarjetas.replaceChildren();
    estado.textContent = '';
    seccion.removeAttribute('aria-busy');
    seccion.hidden = true;
});

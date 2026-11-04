const formulario = document.getElementById('form-busqueda');
const seccion = document.getElementById('resultados-busqueda');
const estado = document.getElementById('estado-resultados');
const tarjetas = document.getElementById('tarjetas-viajes');
const filtros = document.getElementById('filtros-resultados');
const cooperativa = document.getElementById('filtro-cooperativa');
const tipoBus = document.getElementById('filtro-tipo-bus');
let viajesEncontrados = [];

function llenarSelector(selector, opciones, titulo) {
    const todas = crearElemento('option', '', titulo);
    todas.value = '';
    const elementos = [...opciones].sort((a, b) => a[1].localeCompare(b[1], 'es'))
        .map(([valor, nombre]) => {
            const opcion = crearElemento('option', '', nombre);
            opcion.value = valor;
            return opcion;
        });
    selector.replaceChildren(todas, ...elementos);
    selector.value = '';
}

function reiniciarFiltros() {
    viajesEncontrados = [];
    llenarSelector(cooperativa, new Map(), 'Todas las cooperativas');
    llenarSelector(tipoBus, new Map(), 'Todos los tipos de bus');
    filtros.hidden = true;
}

function mostrarFiltrados() {
    const visibles = viajesEncontrados.filter(viaje =>
        (!cooperativa.value || viaje.cooperativaId === cooperativa.value) &&
        (!tipoBus.value || viaje.tipoBusNombre === tipoBus.value)
    );
    tarjetas.replaceChildren(...visibles.map(crearTarjeta));
    estado.textContent = viajesEncontrados.length === 0
        ? 'No se encontraron viajes para el origen, destino y fecha seleccionados.'
        : visibles.length === 0
            ? 'No hay viajes que coincidan con los filtros seleccionados.'
            : `${visibles.length} ${visibles.length === 1 ? 'viaje encontrado' : 'viajes encontrados'}.`;
}

cooperativa.addEventListener('change', mostrarFiltrados);
tipoBus.addEventListener('change', mostrarFiltrados);

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
    
    // CORRECCIÓN: Ahora la ruta sube un nivel (../) para encontrar la página en pages/
    enlace.href = `../seleccion-asientos.html?viaje_id=${viaje.id}`;
    
    enlace.setAttribute('aria-label', `Seleccionar asientos: ${viaje.cooperativaNombre}, ${viaje.origen} a ${viaje.destino}, ${viaje.hora.slice(0, 5)}`);
    cuerpo.appendChild(enlace);
    tarjeta.appendChild(cuerpo);
    columna.appendChild(tarjeta);
    return columna;
}

formulario.addEventListener('busqueda:cargando', () => {
    reiniciarFiltros();
    seccion.hidden = false;
    seccion.setAttribute('aria-busy', 'true');
    tarjetas.replaceChildren();
    estado.textContent = 'Buscando viajes…';
});

formulario.addEventListener('busqueda:resultados', (evento) => {
    reiniciarFiltros();
    viajesEncontrados = evento.detail;
    llenarSelector(cooperativa, new Map(viajesEncontrados.map(viaje =>
        [viaje.cooperativaId, viaje.cooperativaNombre])), 'Todas las cooperativas');
    llenarSelector(tipoBus, new Map(viajesEncontrados.map(viaje =>
        [viaje.tipoBusNombre, viaje.tipoBusNombre])), 'Todos los tipos de bus');
    filtros.hidden = viajesEncontrados.length === 0;
    seccion.hidden = false;
    seccion.removeAttribute('aria-busy');
    mostrarFiltrados();
});

formulario.addEventListener('busqueda:error', () => {
    reiniciarFiltros();
    tarjetas.replaceChildren();
    estado.textContent = '';
    seccion.removeAttribute('aria-busy');
    seccion.hidden = true;
});
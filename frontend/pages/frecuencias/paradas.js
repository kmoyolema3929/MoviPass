import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { obtenerContextoGestion, textoError } from '../../js/contextoUsuario.js';
import { mostrarAlerta } from '../../js/alertas.js';
import { llenarCombo, vaciarCombo } from '../../js/combos.js';

const select = document.getElementById('selectFrecuencia');
const tbody = document.getElementById('tablaParadas');
const form = document.getElementById('formParada');
const btnNueva = document.getElementById('btnNuevaParada');
const btnGuardar = document.getElementById('btnGuardarParada');
const aviso = document.getElementById('avisoSinCompartidas');
const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalParada'));

function filaInformativa(texto, clase = 'text-muted') {
    tbody.replaceChildren();
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = `text-center py-3 ${clase}`;
    td.textContent = texto;
    tr.appendChild(td);
    tbody.appendChild(tr);
}

/* ---------- Frecuencias compartidas (solo ellas pueden tener paradas) ---------- */

async function consultarFrecuencias(rol, cooperativas) {
    let consulta = supabase
        .from('frecuencias')
        .select('id, origen, destino, hora, activa, cooperativas ( nombre )')
        .eq('tipo', 'compartida')
        .order('origen', { ascending: true })
        .order('hora', { ascending: true });

    if (rol === 'cooperativa') {
        consulta = consulta.in('cooperativa_id', cooperativas.map((c) => c.id));
    }

    const { data, error } = await consulta;
    if (error) throw error;
    return data ?? [];
}

function textoFrecuencia(f) {
    const coop = f.cooperativas?.nombre ? ` - ${f.cooperativas.nombre}` : '';
    return `${f.origen} → ${f.destino} (${String(f.hora).slice(0, 5)})${coop}${f.activa ? '' : ' [desactivada]'}`;
}

let sinCooperativa = false;

// Las paradas dependen de la frecuencia: se cargan al elegirla
// (o solas, si hay una sola frecuencia compartida).
function alCargarFrecuencias(frecuencias) {
    if (sinCooperativa) {
        vaciarCombo(select, 'Sin cooperativa asignada');
        filaInformativa('Tu cuenta aún no está asignada a una cooperativa. Contacta al administrador.', 'text-danger');
        return;
    }

    aviso.classList.toggle('d-none', frecuencias.length > 0);
    cargarParadas();
}

// El contexto del usuario se consulta dentro de la carga para que "Reintentar" lo repita.
async function frecuenciasDelUsuario() {
    const contexto = await obtenerContextoGestion();

    sinCooperativa = contexto.rol === 'cooperativa' && contexto.cooperativas.length === 0;
    if (sinCooperativa) return [];

    return consultarFrecuencias(contexto.rol, contexto.cooperativas);
}

async function cargarFrecuencias() {
    filaInformativa('Selecciona una frecuencia para ver sus paradas.');

    const frecuencias = await llenarCombo(select, {
        cargar: frecuenciasDelUsuario,
        texto: textoFrecuencia,
        inicial: 'Selecciona una frecuencia...',
        vacio: 'No hay frecuencias compartidas',
        error: 'No se pudieron cargar las frecuencias.',
        alReintentar: alCargarFrecuencias
    });

    if (frecuencias === null) {
        filaInformativa('No se pudieron cargar las frecuencias. Pulsa «Reintentar» debajo del selector.', 'text-danger');
        return;
    }

    alCargarFrecuencias(frecuencias);
}

/* ---------- Paradas ---------- */

async function cargarParadas() {
    btnNueva.disabled = !select.value;

    if (!select.value) {
        filaInformativa('Selecciona una frecuencia para ver sus paradas.');
        return;
    }

    filaInformativa('Cargando paradas...');

    const { data, error } = await supabase
        .from('paradas')
        .select('id, nombre, hora_estimada')
        .eq('frecuencia_id', select.value)
        .order('hora_estimada', { ascending: true });

    if (error) {
        console.error('Error al cargar las paradas:', error);
        filaInformativa('No se pudieron cargar las paradas.', 'text-danger');
        return;
    }

    if (!data || data.length === 0) {
        filaInformativa('Esta frecuencia aún no tiene paradas.');
        return;
    }

    tbody.replaceChildren();

    data.forEach((p, i) => {
        const tr = document.createElement('tr');

        const tdIndice = document.createElement('td');
        tdIndice.textContent = i + 1;

        const tdNombre = document.createElement('td');
        tdNombre.textContent = p.nombre;

        const tdHora = document.createElement('td');
        tdHora.textContent = String(p.hora_estimada).slice(0, 5);

        const tdAcciones = document.createElement('td');
        tdAcciones.className = 'text-center';

        const eliminar = document.createElement('button');
        eliminar.type = 'button';
        eliminar.className = 'btn btn-sm btn-outline-danger';
        eliminar.textContent = 'Eliminar';
        eliminar.addEventListener('click', () => eliminarParada(p));
        tdAcciones.appendChild(eliminar);

        tr.append(tdIndice, tdNombre, tdHora, tdAcciones);
        tbody.appendChild(tr);
    });
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    document.getElementById('nombreParada').value = document.getElementById('nombreParada').value.trim();

    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
    }

    if (!select.value) {
        mostrarAlerta('Selecciona primero una frecuencia.', 'warning');
        return;
    }

    const textoOriginal = btnGuardar.textContent;
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando...';

    try {
        const { error } = await supabase.from('paradas').insert({
            frecuencia_id: Number(select.value),
            nombre: document.getElementById('nombreParada').value,
            hora_estimada: document.getElementById('horaEstimada').value
        });

        if (error) throw error;

        modal.hide();
        form.reset();
        form.classList.remove('was-validated');
        await cargarParadas();
        mostrarAlerta('Parada agregada.', 'success');
    } catch (error) {
        console.error('Error al guardar la parada:', error);
        mostrarAlerta(textoError(error), 'danger');
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = textoOriginal;
    }
});

async function eliminarParada(parada) {
    if (!confirm(`¿Eliminar la parada "${parada.nombre}"?`)) return;

    const { error } = await supabase.from('paradas').delete().eq('id', parada.id);

    if (error) {
        mostrarAlerta(textoError(error), 'danger');
        return;
    }

    await cargarParadas();
    mostrarAlerta('Parada eliminada.', 'success');
}

/* ---------- Inicio ---------- */

select.addEventListener('change', cargarParadas);

btnNueva.addEventListener('click', () => {
    form.reset();
    form.classList.remove('was-validated');
    modal.show();
});

async function iniciar() {
    const rol = await exigirRoles(['administrador', 'cooperativa']);
    if (!rol) return;

    document.getElementById('btnVolver').href = `../${rol}/index.html`;

    try {
        await cargarFrecuencias();
    } catch (error) {
        console.error('Error al iniciar la página de paradas:', error);
        filaInformativa('No se pudieron cargar las frecuencias.', 'text-danger');
        mostrarAlerta(textoError(error), 'danger');
    }
}

iniciar();
import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { obtenerContextoGestion, textoError } from '../../js/contextoUsuario.js';
import { mostrarAlerta } from '../../js/alertas.js';

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

async function cargarFrecuencias(rol, cooperativas) {
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

    select.replaceChildren();

    if (!data || data.length === 0) {
        const op = document.createElement('option');
        op.value = '';
        op.textContent = 'No hay frecuencias compartidas';
        select.appendChild(op);
        aviso.classList.remove('d-none');
        return;
    }

    const primera = document.createElement('option');
    primera.value = '';
    primera.textContent = 'Selecciona una frecuencia...';
    select.appendChild(primera);

    data.forEach((f) => {
        const op = document.createElement('option');
        op.value = f.id;
        const coop = f.cooperativas?.nombre ? ` - ${f.cooperativas.nombre}` : '';
        op.textContent = `${f.origen} → ${f.destino} (${String(f.hora).slice(0, 5)})${coop}${f.activa ? '' : ' [desactivada]'}`;
        select.appendChild(op);
    });

    select.disabled = false;
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
        const contexto = await obtenerContextoGestion();

        if (contexto.rol === 'cooperativa' && contexto.cooperativas.length === 0) {
            select.replaceChildren(new Option('Sin cooperativa asignada', ''));
            filaInformativa('Tu cuenta aún no está asignada a una cooperativa. Contacta al administrador.', 'text-danger');
            return;
        }

        await cargarFrecuencias(contexto.rol, contexto.cooperativas);
    } catch (error) {
        console.error('Error al iniciar la página de paradas:', error);
        filaInformativa('No se pudieron cargar las frecuencias.', 'text-danger');
        mostrarAlerta(textoError(error), 'danger');
    }
}

iniciar();
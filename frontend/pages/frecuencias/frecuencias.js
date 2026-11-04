import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { obtenerContextoGestion, textoError } from '../../js/contextoUsuario.js';
import { mostrarAlerta } from '../../js/alertas.js';

const COLUMNAS = 9;

const tbody = document.getElementById('tablaFrecuencias');
const form = document.getElementById('formFrecuencia');
const btnNueva = document.getElementById('btnNueva');
const btnGuardar = document.getElementById('btnGuardar');
const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalFrecuencia'));

const campo = {
    id: document.getElementById('frecuenciaId'),
    cooperativa: document.getElementById('cooperativa'),
    origen: document.getElementById('origen'),
    destino: document.getElementById('destino'),
    hora: document.getElementById('hora'),
    precio: document.getElementById('precioBase'),
    tipo: document.getElementById('tipo'),
    resolucion: document.getElementById('resolucion')
};

let cooperativas = [];
let frecuencias = [];

/* ---------- Utilidades de tabla ---------- */

function filaInformativa(texto, clase = 'text-muted') {
    tbody.replaceChildren();
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = COLUMNAS;
    td.className = `text-center py-3 ${clase}`;
    td.textContent = texto;
    tr.appendChild(td);
    tbody.appendChild(tr);
}

function celda(texto) {
    const td = document.createElement('td');
    td.textContent = texto;
    return td;
}

function boton(texto, clase, accion) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn btn-sm ${clase}`;
    b.textContent = texto;
    b.addEventListener('click', accion);
    return b;
}

function enlace(texto, clase, href) {
    const a = document.createElement('a');
    a.className = `btn btn-sm ${clase}`;
    a.href = href;
    a.textContent = texto;
    return a;
}

/* ---------- Listado ---------- */

async function cargarFrecuencias() {
    let consulta = supabase
        .from('frecuencias')
        .select('id, origen, destino, hora, tipo, activa, precio_base, numero_resolucion, cooperativa_id, cooperativas ( nombre )')
        .order('origen', { ascending: true })
        .order('hora', { ascending: true });

    // Una cooperativa solo ve las suyas; el administrador ve todas
    if (campo.cooperativa.dataset.rol === 'cooperativa') {
        consulta = consulta.in('cooperativa_id', cooperativas.map((c) => c.id));
    }

    const { data, error } = await consulta;
    if (error) throw error;

    frecuencias = data ?? [];
    dibujarTabla();
}

function dibujarTabla() {
    if (frecuencias.length === 0) {
        filaInformativa('No hay frecuencias registradas.');
        return;
    }

    tbody.replaceChildren();

    frecuencias.forEach((f, i) => {
        const tr = document.createElement('tr');
        if (!f.activa) tr.className = 'table-secondary';

        const tdEstado = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = f.activa ? 'badge bg-success' : 'badge bg-secondary';
        badge.textContent = f.activa ? 'Activa' : 'Desactivada';
        tdEstado.appendChild(badge);

        const tdAcciones = document.createElement('td');
        tdAcciones.className = 'text-center text-nowrap';

        if (f.tipo === 'compartida') {
            tdAcciones.append(enlace('Paradas', 'btn-outline-secondary me-1', 'gestor-paradas.html'));
        }

        tdAcciones.append(
            boton('Editar', 'btn-outline-primary me-1', () => abrirEditar(f.id)),
            boton(f.activa ? 'Desactivar' : 'Activar', 'btn-outline-warning me-1', () => cambiarEstado(f)),
            boton('Eliminar', 'btn-outline-danger', () => eliminar(f))
        );

        tr.append(
            celda(i + 1),
            celda(f.cooperativas?.nombre ?? 'Sin cooperativa'),
            celda(`${f.origen} → ${f.destino}`),
            celda(String(f.hora).slice(0, 5)),
            celda(f.tipo === 'compartida' ? 'Compartida' : 'Directa'),
            celda(f.numero_resolucion ?? '—'),
            celda('$' + Number(f.precio_base).toFixed(2)),
            tdEstado,
            tdAcciones
        );
        tbody.appendChild(tr);
    });
}

/* ---------- Formulario ---------- */

function llenarCooperativas(seleccionada = '') {
    campo.cooperativa.replaceChildren();

    const vacia = document.createElement('option');
    vacia.value = '';
    vacia.textContent = 'Selecciona una cooperativa...';
    campo.cooperativa.appendChild(vacia);

    cooperativas.forEach((c) => {
        const op = document.createElement('option');
        op.value = c.id;
        op.textContent = c.nombre;
        campo.cooperativa.appendChild(op);
    });

    // Si solo administra una cooperativa, se preselecciona
    campo.cooperativa.value = seleccionada || (cooperativas.length === 1 ? cooperativas[0].id : '');
}

function abrirCrear() {
    form.reset();
    form.classList.remove('was-validated');
    campo.id.value = '';
    llenarCooperativas();
    document.getElementById('modalFrecuenciaLabel').textContent = 'Nueva frecuencia';
    modal.show();
}

function abrirEditar(id) {
    const f = frecuencias.find((x) => x.id === id);
    if (!f) return;

    form.reset();
    form.classList.remove('was-validated');
    campo.id.value = f.id;
    llenarCooperativas(f.cooperativa_id ?? '');
    campo.origen.value = f.origen;
    campo.destino.value = f.destino;
    campo.hora.value = String(f.hora).slice(0, 5);
    campo.precio.value = f.precio_base;
    campo.tipo.value = f.tipo;
    campo.resolucion.value = f.numero_resolucion ?? '';
    document.getElementById('modalFrecuenciaLabel').textContent = 'Editar frecuencia';
    modal.show();
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    campo.origen.value = campo.origen.value.trim();
    campo.destino.value = campo.destino.value.trim();
    campo.resolucion.value = campo.resolucion.value.trim();

    // Origen y destino no pueden ser iguales
    const iguales = campo.origen.value.toLowerCase() === campo.destino.value.toLowerCase();
    campo.destino.setCustomValidity(iguales && campo.destino.value ? 'Igual al origen' : '');

    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        if (iguales) mostrarAlerta('El origen y el destino no pueden ser iguales.', 'warning');
        return;
    }

    const datos = {
        cooperativa_id: campo.cooperativa.value,
        origen: campo.origen.value,
        destino: campo.destino.value,
        hora: campo.hora.value,
        tipo: campo.tipo.value,
        precio_base: Number(campo.precio.value),
        numero_resolucion: campo.resolucion.value // obligatoria
    };

    const textoOriginal = btnGuardar.textContent;
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando...';

    try {
        const id = campo.id.value;
        const { error } = id
            ? await supabase.from('frecuencias').update(datos).eq('id', id)
            : await supabase.from('frecuencias').insert(datos);

        if (error) throw error;

        modal.hide();
        await cargarFrecuencias();
        mostrarAlerta(
            id
                ? 'Frecuencia actualizada.'
                : 'Frecuencia creada. Ahora asígnale un bus cada día en la hoja de ruta.',
            'success'
        );
    } catch (error) {
        console.error('Error al guardar la frecuencia:', error);
        mostrarAlerta(
            error?.code === '23502' || error?.code === '23514' && String(error.message).includes('resolucion')
                ? 'El número de resolución es obligatorio.'
                : textoError(error),
            'danger'
        );
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = textoOriginal;
    }
});

campo.destino.addEventListener('input', () => campo.destino.setCustomValidity(''));
campo.origen.addEventListener('input', () => campo.destino.setCustomValidity(''));

/* ---------- Activar / desactivar y eliminar ---------- */

async function cambiarEstado(f) {
    const { error } = await supabase
        .from('frecuencias')
        .update({ activa: !f.activa })
        .eq('id', f.id);

    if (error) {
        mostrarAlerta(textoError(error), 'danger');
        return;
    }

    await cargarFrecuencias();
    mostrarAlerta(f.activa ? 'Frecuencia desactivada.' : 'Frecuencia activada.', 'success');
}

async function eliminar(f) {
    if (!confirm(`¿Eliminar la frecuencia ${f.origen} → ${f.destino} de las ${String(f.hora).slice(0, 5)}?`)) return;

    const { error } = await supabase.from('frecuencias').delete().eq('id', f.id);

    if (error) {
        mostrarAlerta(
            error.code === '23503'
                ? 'No se puede eliminar: la frecuencia tiene hojas de ruta o viajes. Desactívala en su lugar.'
                : textoError(error),
            'danger'
        );
        return;
    }

    await cargarFrecuencias();
    mostrarAlerta('Frecuencia eliminada.', 'success');
}

/* ---------- Inicio ---------- */

btnNueva.addEventListener('click', abrirCrear);

async function iniciar() {
    const rol = await exigirRoles(['administrador', 'cooperativa']);
    if (!rol) return;

    document.getElementById('btnVolver').href = `../${rol}/index.html`;

    try {
        const contexto = await obtenerContextoGestion();
        cooperativas = contexto.cooperativas;
        campo.cooperativa.dataset.rol = contexto.rol;

        if (contexto.rol === 'cooperativa' && cooperativas.length === 0) {
            filaInformativa('Tu cuenta aún no está asignada a una cooperativa. Contacta al administrador.', 'text-danger');
            return;
        }

        btnNueva.disabled = false;
        await cargarFrecuencias();
    } catch (error) {
        console.error('Error al cargar las frecuencias:', error);
        filaInformativa('No se pudieron cargar las frecuencias.', 'text-danger');
        mostrarAlerta(textoError(error), 'danger');
    }
}

iniciar();
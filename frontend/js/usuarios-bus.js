// frontend/js/usuarios-bus.js
// Gestión de usuarios bus del gerente (cambio 6, parte 4): chofer, controlador
// o dueño que usarán la app del bus. Mismo diseño y mecanismo que oficinistas.

import { supabase } from './supabaseClient.js';
import { mostrarAlerta } from './alertas.js';
import { exigirRoles } from './guardas.js';
import { asignarCuentaExistente, crearCuentaPersonal, obtenerMiCooperativa } from './cuentasPersonal.js';
import {
    limpiar, mensajeErrorCuenta, mensajeErrorPersonal, revisarCuentaExistente, revisarPersona, textoFuncion
} from './personal.js';
import { fechaMaximaNacimiento } from './reglasCuenta.js';

const form = document.getElementById('formUsuarioBus');
const btn = document.getElementById('btnGuardar');
const btnCancelar = document.getElementById('btnCancelarEdicion');
const tbody = document.getElementById('tablaUsuariosBus');
const perfilId = document.getElementById('perfilId');
const COLUMNAS = 6;

const campos = ['cedula', 'nombres', 'apellidos', 'funcion', 'telefono', 'fecha_nacimiento', 'email', 'password']
    .reduce((todos, id) => ({ ...todos, [id]: document.getElementById(id) }), {});

let miCooperativaId = null;
let usuarios = [];
let ocupado = false;

const editando = () => Boolean(perfilId.value);

// "Crear una cuenta nueva" o "Asignar una cuenta existente" (cambio 3); al editar no aplica.
const esExistente = () => !editando() && document.getElementById('modoExistente').checked;

function aplicarModo() {
    form.querySelectorAll('.oculto-existente').forEach(bloque => bloque.classList.toggle('d-none', esExistente()));
    document.getElementById('notaExistente').classList.toggle('d-none', !esExistente());
    document.getElementById('grupoModo').classList.toggle('d-none', editando());
}

form.querySelectorAll('input[name="modo"]').forEach(radio => radio.addEventListener('change', () => {
    aplicarModo();
    mostrarErrores({});
    btn.textContent = textoBoton();
}));
campos.fecha_nacimiento.max = fechaMaximaNacimiento();

function filaMensaje(texto, clase = 'text-muted') {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = COLUMNAS;
    td.className = `text-center py-3 ${clase}`;
    td.textContent = texto;
    tr.appendChild(td);
    return tr;
}

function boton(texto, clase, accion) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn btn-sm ${clase}`;
    b.textContent = texto;
    b.addEventListener('click', accion);
    return b;
}

function mostrarErrores(errores) {
    let primero = null;

    Object.entries(campos).forEach(([clave, campo]) => {
        const problema = errores[clave] ?? '';
        campo.classList.toggle('is-invalid', Boolean(problema));
        form.querySelector(`[data-error="${clave}"]`).textContent = problema;
        if (problema) primero ??= campo;
    });

    primero?.focus();
}

function textoBoton() {
    if (editando()) return 'Guardar cambios';
    return esExistente() ? 'Asignar Usuario bus' : 'Crear Usuario bus';
}

function modoCreacion() {
    form.reset();
    perfilId.value = '';
    aplicarModo();
    mostrarErrores({});
    document.getElementById('tituloFormulario').textContent = 'Registrar Nuevo Usuario bus';
    document.getElementById('camposCuenta').classList.remove('d-none');
    document.getElementById('notaEdicion').classList.add('d-none');
    btnCancelar.classList.add('d-none');
    btn.textContent = textoBoton();
}

function editar(usuario) {
    if (ocupado) return;

    modoCreacion();
    perfilId.value = usuario.id;
    campos.cedula.value = usuario.cedula ?? '';
    campos.nombres.value = usuario.nombres ?? '';
    campos.apellidos.value = usuario.apellidos ?? '';
    campos.telefono.value = usuario.telefono ?? '';
    campos.funcion.value = usuario.funcion_bus ?? '';
    aplicarModo();

    document.getElementById('tituloFormulario').textContent = `Editar a ${usuario.nombres} ${usuario.apellidos}`;
    document.getElementById('camposCuenta').classList.add('d-none');
    document.getElementById('notaEdicion').classList.remove('d-none');
    btnCancelar.classList.remove('d-none');
    btn.textContent = textoBoton();
    campos.cedula.focus();
}

function crearFila(usuario) {
    const tr = document.createElement('tr');
    const celda = (texto, clase = '') => {
        const td = document.createElement('td');
        td.className = clase;
        td.textContent = texto;
        tr.appendChild(td);
        return td;
    };

    celda(`${usuario.nombres ?? ''} ${usuario.apellidos ?? ''}`.trim());
    celda(usuario.cedula ?? '');
    celda(textoFuncion(usuario.funcion_bus) || '—');

    const tdEstado = celda('');
    const activo = usuario.estado === 'activo';
    const badge = document.createElement('span');
    badge.className = `badge ${activo ? 'bg-success' : 'bg-danger'}`;
    badge.textContent = activo ? 'Activo' : 'Suspendido';
    tdEstado.appendChild(badge);

    const tdBus = celda(usuario.buses_asignados ?? '', 'small');
    if (!usuario.buses_asignados) {
        const sin = document.createElement('span');
        sin.className = 'text-muted';
        sin.textContent = 'Sin bus';
        tdBus.appendChild(sin);
    }

    const tdAcciones = celda('', 'text-nowrap');
    const quitar = boton('Quitar', 'btn-outline-danger', () => void quitarUsuario(usuario));

    // Asignado a un bus: no se puede quitar (la base también lo impide).
    if (usuario.buses_asignados) {
        quitar.disabled = true;
        quitar.title = `Está asignado al bus ${usuario.buses_asignados}. Cámbialo primero en Gestión de buses.`;
    }

    tdAcciones.append(
        boton('Editar', 'btn-outline-primary me-1', () => editar(usuario)),
        boton(activo ? 'Suspender' : 'Reactivar', `${activo ? 'btn-outline-warning' : 'btn-outline-success'} me-1`,
            () => void cambiarEstado(usuario)),
        quitar
    );

    return tr;
}

async function cargarUsuarios() {
    tbody.replaceChildren(filaMensaje('Cargando usuarios bus...'));

    try {
        miCooperativaId = await obtenerMiCooperativa();

        if (!miCooperativaId) {
            tbody.replaceChildren(filaMensaje('Tu cuenta no está asignada a una cooperativa.', 'text-danger'));
            return;
        }

        const { data, error } = await supabase.rpc('obtener_usuarios_bus_de_cooperativa', {
            p_cooperativa_id: miCooperativaId
        });

        if (error) throw error;

        usuarios = data ?? [];
        tbody.replaceChildren();

        if (usuarios.length === 0) {
            tbody.appendChild(filaMensaje('No hay usuarios bus registrados aún.'));
            return;
        }

        usuarios.forEach(usuario => tbody.appendChild(crearFila(usuario)));
    } catch (error) {
        console.error('No se pudieron cargar los usuarios bus:', error);
        tbody.replaceChildren(filaMensaje(mensajeErrorPersonal(error), 'text-danger'));
    }
}

async function cambiarEstado(usuario) {
    if (ocupado) return;

    const nuevo = usuario.estado === 'activo' ? 'suspendido' : 'activo';
    const accion = nuevo === 'activo' ? 'reactivar' : 'suspender';

    if (!confirm(`¿Estás seguro de ${accion} a ${usuario.nombres} ${usuario.apellidos}?`)) return;

    ocupado = true;

    try {
        const { error } = await supabase.rpc('cambiar_estado_usuario_bus', {
            p_perfil_id: usuario.id,
            p_estado: nuevo
        });

        if (error) throw error;

        mostrarAlerta('Estado actualizado.', 'success');
        await cargarUsuarios();
    } catch (error) {
        console.error(error);
        mostrarAlerta(mensajeErrorPersonal(error), 'danger');
    } finally {
        ocupado = false;
    }
}

async function quitarUsuario(usuario) {
    if (ocupado || usuario.buses_asignados) return;

    if (!confirm(`¿Estás seguro de quitar a ${usuario.nombres} ${usuario.apellidos} de tu cooperativa? Su cuenta volverá a ser de cliente.`)) return;

    ocupado = true;

    try {
        const { error } = await supabase.rpc('quitar_usuario_bus', { p_perfil_id: usuario.id });

        if (error) throw error;

        if (perfilId.value === usuario.id) modoCreacion();
        mostrarAlerta('Usuario bus quitado de la cooperativa. Su cuenta vuelve a ser de cliente.', 'success');
        await cargarUsuarios();
    } catch (error) {
        console.error(error);
        mostrarAlerta(mensajeErrorPersonal(error), 'danger');
        await cargarUsuarios();
    } finally {
        ocupado = false;
    }
}

form.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    if (ocupado) return;

    if (!miCooperativaId) {
        mostrarAlerta('No se pudo identificar la cooperativa.', 'danger');
        return;
    }

    const datos = Object.fromEntries(Object.entries(campos).map(([clave, campo]) => [clave, campo.value]));
    const existente = esExistente();
    const errores = existente
        ? revisarCuentaExistente(datos, { funcion: true })
        : revisarPersona(datos, { cuenta: !editando(), funcion: true });

    mostrarErrores(errores);
    if (Object.keys(errores).length) return;

    ocupado = true;
    btn.disabled = true;
    btn.textContent = editando() ? 'Guardando...' : existente ? 'Asignando...' : 'Creando usuario...';

    try {
        if (existente) {
            await asignarCuentaExistente({
                cedula: datos.cedula,
                email: datos.email,
                cooperativaId: miCooperativaId,
                rol: 'bus',
                funcion: datos.funcion
            });
            mostrarAlerta('¡Cuenta asignada como usuario bus! Ya puedes asignarla a un bus en Gestión de buses.', 'success');
        } else if (editando()) {
            const { error } = await supabase.rpc('actualizar_usuario_bus', {
                p_perfil_id: perfilId.value,
                p_cedula: limpiar(datos.cedula),
                p_nombres: limpiar(datos.nombres),
                p_apellidos: limpiar(datos.apellidos),
                p_telefono: limpiar(datos.telefono) || null,
                p_funcion_bus: datos.funcion
            });

            if (error) throw error;
            mostrarAlerta('Datos actualizados.', 'success');
        } else {
            await crearCuentaPersonal({
                datos,
                cooperativaId: miCooperativaId,
                rol: 'bus',
                funcion: datos.funcion
            });
            mostrarAlerta('¡Usuario bus creado! Le llegará un código a su correo: lo escribirá la primera vez que entre. ' +
                'Ya puedes asignarlo a un bus en Gestión de buses.', 'success');
        }

        modoCreacion();
        await cargarUsuarios();
    } catch (error) {
        console.error(error);
        mostrarAlerta(editando() || existente ? mensajeErrorPersonal(error) : mensajeErrorCuenta(error), 'danger');
    } finally {
        ocupado = false;
        btn.disabled = false;
        btn.textContent = textoBoton();
    }
});

btnCancelar.addEventListener('click', modoCreacion);
Object.values(campos).forEach(campo => {
    campo.addEventListener('input', () => campo.classList.remove('is-invalid'));
    campo.addEventListener('change', () => campo.classList.remove('is-invalid'));
});
campos.cedula.addEventListener('input', () => { campos.cedula.value = campos.cedula.value.replace(/\D/g, ''); });
campos.telefono.addEventListener('input', () => { campos.telefono.value = campos.telefono.value.replace(/\D/g, ''); });

// Solo el gerente (rol 'cooperativa'). guardas.js conecta #btnCerrarSesion.
const rol = await exigirRoles(['cooperativa']);
if (rol) await cargarUsuarios();

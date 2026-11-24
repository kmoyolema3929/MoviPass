// frontend/js/oficinistas.js
// Gestión de oficinistas del gerente (cambio 6, parte 4: ubicación de la oficina).
// Antes este código estaba dentro de gestor-oficinistas.html.

import { supabase } from './supabaseClient.js';
import { mostrarAlerta } from './alertas.js';
import { exigirRoles } from './guardas.js';
import { crearCuentaPersonal, obtenerMiCooperativa } from './cuentasPersonal.js';
import { limpiar, mensajeErrorCuenta, mensajeErrorPersonal, revisarPersona, revisarUbicacion } from './personal.js';

const form = document.getElementById('formOficinista');
const btn = document.getElementById('btnGuardar');
const tbody = document.getElementById('tablaOficinistas');
const COLUMNAS = 5;

const campos = ['nombres', 'apellidos', 'cedula', 'ubicacion', 'email', 'password']
    .reduce((todos, id) => ({ ...todos, [id]: document.getElementById(id) }), {});

let miCooperativaId = null;
let ocupado = false;

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

// Ubicación: se ve en la lista y se edita ahí mismo.
function celdaUbicacion(perfil) {
    const td = document.createElement('td');

    const mostrar = () => {
        td.replaceChildren();

        if (perfil.ubicacion_oficina) {
            td.append(document.createTextNode(perfil.ubicacion_oficina));
        } else {
            const falta = document.createElement('span');
            falta.className = 'badge text-bg-warning';
            falta.textContent = 'Sin ubicación';
            falta.title = 'Este oficinista se creó antes de pedir la ubicación: complétala.';
            td.append(falta);
        }

        td.append(document.createTextNode(' '),
            boton(perfil.ubicacion_oficina ? 'Editar' : 'Agregar', 'btn-link p-0 align-baseline', editar));
    };

    const editar = () => {
        if (ocupado) return;

        const entrada = document.createElement('input');
        entrada.type = 'text';
        entrada.className = 'form-control form-control-sm';
        entrada.maxLength = 120;
        entrada.value = perfil.ubicacion_oficina ?? '';
        entrada.setAttribute('aria-label', `Ubicación de la oficina de ${perfil.nombres} ${perfil.apellidos} *`);

        const aviso = document.createElement('div');
        aviso.className = 'invalid-feedback';

        const guardar = async () => {
            const problema = revisarUbicacion(entrada.value);
            entrada.classList.toggle('is-invalid', Boolean(problema));
            aviso.textContent = problema;
            if (problema || ocupado) return;

            ocupado = true;
            try {
                const { error } = await supabase.rpc('actualizar_ubicacion_oficinista', {
                    p_perfil_id: perfil.id,
                    p_ubicacion: limpiar(entrada.value)
                });
                if (error) throw error;

                perfil.ubicacion_oficina = limpiar(entrada.value);
                mostrarAlerta('Ubicación actualizada.', 'success');
                mostrar();
            } catch (error) {
                console.error(error);
                aviso.textContent = mensajeErrorPersonal(error);
                entrada.classList.add('is-invalid');
            } finally {
                ocupado = false;
            }
        };

        entrada.addEventListener('keydown', evento => {
            if (evento.key === 'Enter') { evento.preventDefault(); void guardar(); }
            if (evento.key === 'Escape') mostrar();
        });

        const acciones = document.createElement('div');
        acciones.className = 'd-flex gap-1 mt-1';
        acciones.append(boton('Guardar', 'btn-primary', () => void guardar()), boton('Cancelar', 'btn-outline-secondary', mostrar));

        td.replaceChildren(entrada, aviso, acciones);
        entrada.focus();
    };

    mostrar();
    return td;
}

function crearFilaOficinista(perfil) {
    const tr = document.createElement('tr');

    const tdNombre = document.createElement('td');
    tdNombre.textContent = `${perfil.nombres ?? ''} ${perfil.apellidos ?? ''}`.trim();

    const tdCedula = document.createElement('td');
    tdCedula.textContent = perfil.cedula ?? '';

    const tdEstado = document.createElement('td');
    const badge = document.createElement('span');
    const activo = perfil.estado === 'activo';
    badge.className = `badge ${activo ? 'bg-success' : 'bg-danger'}`;
    badge.textContent = activo ? 'Activo' : 'Suspendido';
    tdEstado.appendChild(badge);

    const tdAcciones = document.createElement('td');
    tdAcciones.className = 'text-nowrap';
    tdAcciones.append(
        boton(activo ? 'Suspender' : 'Activar', `${activo ? 'btn-outline-warning' : 'btn-outline-success'} me-1`,
            () => void cambiarEstadoOficinista(perfil.id, perfil.estado)),
        boton('Eliminar', 'btn-outline-danger', () => void eliminarOficinista(perfil.id))
    );

    tr.append(tdNombre, tdCedula, celdaUbicacion(perfil), tdEstado, tdAcciones);
    return tr;
}

// 1. Cargar únicamente el personal de la cooperativa del gerente.
// Se usa una función de la base de datos porque las reglas de seguridad
// no dejan al gerente leer las asignaciones de otros usuarios.
async function cargarOficinistas() {
    tbody.replaceChildren(filaMensaje('Cargando oficinistas...'));

    try {
        miCooperativaId = await obtenerMiCooperativa();

        if (!miCooperativaId) {
            tbody.replaceChildren(filaMensaje('Tu cuenta no está asignada a una cooperativa.', 'text-danger'));
            return;
        }

        const { data, error } = await supabase.rpc('obtener_oficinistas_de_cooperativa', {
            p_cooperativa_id: miCooperativaId
        });

        if (error) throw error;

        const oficinistas = data ?? [];
        tbody.replaceChildren();

        if (oficinistas.length === 0) {
            tbody.appendChild(filaMensaje('No hay oficinistas registrados aún.'));
            return;
        }

        oficinistas.forEach(perfil => tbody.appendChild(crearFilaOficinista(perfil)));

        const sinUbicacion = oficinistas.filter(o => !o.ubicacion_oficina).length;
        if (sinUbicacion > 0) {
            mostrarAlerta(
                `${sinUbicacion === 1 ? 'Un oficinista no tiene' : `${sinUbicacion} oficinistas no tienen`} ubicación de la oficina: complétala en la lista.`,
                'warning'
            );
        }
    } catch (error) {
        console.error('No se pudo cargar el personal:', error);
        tbody.replaceChildren(filaMensaje(mensajeErrorPersonal(error), 'text-danger'));
    }
}

// 2. Cambiar estado (Suspender/Activar)
async function cambiarEstadoOficinista(perfilId, estadoActual) {
    if (ocupado) return;

    const nuevoEstado = estadoActual === 'activo' ? 'suspendido' : 'activo';
    const accion = nuevoEstado === 'activo' ? 'activar' : 'suspender';

    if (!confirm(`¿Estás seguro de ${accion} a este oficinista?`)) return;

    ocupado = true;

    try {
        const { error } = await supabase.rpc('cambiar_estado_oficinista', {
            p_perfil_id: perfilId,
            p_estado: nuevoEstado
        });

        if (error) throw error;

        mostrarAlerta('Estado actualizado.', 'success');
        await cargarOficinistas();
    } catch (error) {
        console.error(error);
        mostrarAlerta(mensajeErrorPersonal(error), 'danger');
    } finally {
        ocupado = false;
    }
}

// 3. Quitar al oficinista de la cooperativa
async function eliminarOficinista(perfilId) {
    if (ocupado) return;

    if (!confirm('¿Estás seguro de quitar a este oficinista de tu cooperativa?')) return;

    ocupado = true;

    try {
        const { error } = await supabase.rpc('quitar_oficinista', { p_perfil_id: perfilId });

        if (error) throw error;

        mostrarAlerta('Oficinista removido de la cooperativa.', 'success');
        await cargarOficinistas();
    } catch (error) {
        console.error(error);
        mostrarAlerta(mensajeErrorPersonal(error), 'danger');
    } finally {
        ocupado = false;
    }
}

// 4. Crear nuevo oficinista
form.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    if (ocupado) return;

    if (!miCooperativaId) {
        mostrarAlerta('No se pudo identificar la cooperativa.', 'danger');
        return;
    }

    const datos = Object.fromEntries(Object.entries(campos).map(([clave, campo]) => [clave, campo.value]));
    const errores = revisarPersona(datos);
    const problemaUbicacion = revisarUbicacion(datos.ubicacion);
    if (problemaUbicacion) errores.ubicacion = problemaUbicacion;

    mostrarErrores(errores);
    if (Object.keys(errores).length) return;

    ocupado = true;
    btn.disabled = true;
    btn.textContent = 'Creando usuario...';

    try {
        await crearCuentaPersonal({
            datos: { ...datos, telefono: '' },
            cooperativaId: miCooperativaId,
            rol: 'oficinista',
            ubicacion: limpiar(datos.ubicacion)
        });

        mostrarAlerta('¡Oficinista creado con éxito!', 'success');
        form.reset();
        await cargarOficinistas();
    } catch (error) {
        console.error(error);
        mostrarAlerta(mensajeErrorCuenta(error), 'danger');
    } finally {
        ocupado = false;
        btn.disabled = false;
        btn.textContent = 'Crear Oficinista';
    }
});

Object.values(campos).forEach(campo => campo.addEventListener('input', () => campo.classList.remove('is-invalid')));

// Solo el gerente (rol 'cooperativa') puede administrar su personal.
// guardas.js también conecta el botón #btnCerrarSesion.
const rol = await exigirRoles(['cooperativa']);
if (rol) await cargarOficinistas();

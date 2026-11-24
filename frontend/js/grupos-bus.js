// frontend/js/grupos-bus.js
// Pantalla "Grupos de bus" del gerente de la cooperativa (cambio 6, parte 1).

import { supabase } from './supabaseClient.js';
import { exigirRoles } from './guardas.js';
import {
    mensajeErrorGrupo,
    normalizarNombreGrupo,
    obtenerGruposBus,
    textoBuses,
    validarNombreGrupo
} from './gruposBus.js';

let cooperativa = null;
let grupos = [];
let ocupado = false;

const mensaje = document.getElementById('mensaje');
const nombreCoop = document.getElementById('nombreCoop');
const formulario = document.getElementById('formGrupo');
const campos = document.getElementById('camposGrupo');
const grupoId = document.getElementById('grupoId');
const nombre = document.getElementById('nombreGrupo');
const avisoNombre = document.getElementById('avisoNombre');
const titulo = document.getElementById('tituloFormulario');
const botonGuardar = document.getElementById('btnGuardarGrupo');
const botonCancelar = document.getElementById('btnCancelarEdicion');
const tabla = document.getElementById('tablaGrupos');

function mostrarMensaje(texto, tipo = 'info') {
    mensaje.textContent = texto;
    mensaje.className = `alert alert-${tipo}`;
}

function ocultarMensaje() {
    mensaje.classList.add('d-none');
}

function mostrarEstadoTabla(texto) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 3;
    celda.className = 'text-center text-muted py-4';
    celda.textContent = texto;
    fila.appendChild(celda);
    tabla.replaceChildren(fila);
}

function cambiarOcupado(valor) {
    ocupado = valor;
    campos.disabled = valor || !cooperativa;
    botonGuardar.textContent = valor
        ? 'Guardando...'
        : grupoId.value ? 'Guardar cambios' : 'Crear grupo';

    tabla.querySelectorAll('button').forEach(boton => {
        boton.disabled = valor || boton.dataset.bloqueado === 'si';
    });
}

function limpiarFormulario() {
    formulario.reset();
    formulario.classList.remove('was-validated');
    nombre.setCustomValidity('');
    grupoId.value = '';
    titulo.textContent = 'Nuevo grupo';
    botonGuardar.textContent = 'Crear grupo';
    botonCancelar.classList.add('d-none');
}

function editar(grupo) {
    if (ocupado) return;

    limpiarFormulario();
    grupoId.value = grupo.id;
    nombre.value = grupo.nombre;
    titulo.textContent = `Renombrar «${grupo.nombre}»`;
    botonGuardar.textContent = 'Guardar cambios';
    botonCancelar.classList.remove('d-none');
    nombre.focus();
}

function boton(texto, clase, etiqueta, accion) {
    const elemento = document.createElement('button');
    elemento.type = 'button';
    elemento.className = `btn btn-sm ${clase}`;
    elemento.textContent = texto;
    elemento.setAttribute('aria-label', etiqueta);
    elemento.addEventListener('click', accion);
    return elemento;
}

function mostrarGrupos() {
    if (grupos.length === 0) {
        mostrarEstadoTabla('Aún no tienes grupos. Crea el primero con el formulario.');
        return;
    }

    tabla.replaceChildren();

    grupos.forEach(grupo => {
        const fila = document.createElement('tr');

        const celdaNombre = document.createElement('td');
        celdaNombre.className = 'text-break';
        celdaNombre.textContent = grupo.nombre;

        const celdaBuses = document.createElement('td');
        celdaBuses.textContent = textoBuses(grupo.buses);

        const acciones = document.createElement('td');
        acciones.className = 'text-nowrap';

        const renombrar = boton('Renombrar', 'btn-outline-primary', `Renombrar el grupo ${grupo.nombre}`,
            () => editar(grupo));

        const eliminar = boton('Eliminar', 'btn-outline-danger ms-2', `Eliminar el grupo ${grupo.nombre}`,
            () => eliminarGrupo(grupo));

        // Con buses no se puede eliminar (la base también lo impide).
        if (grupo.buses > 0) {
            eliminar.dataset.bloqueado = 'si';
            eliminar.disabled = true;
            eliminar.title = 'Primero cambia sus buses a otro grupo.';
        }

        acciones.append(renombrar, eliminar);
        fila.append(celdaNombre, celdaBuses, acciones);
        tabla.appendChild(fila);
    });
}

async function cargarGrupos() {
    mostrarEstadoTabla('Cargando grupos...');
    grupos = await obtenerGruposBus(cooperativa.id);
    mostrarGrupos();
}

async function guardar(evento) {
    evento.preventDefault();
    if (ocupado || !cooperativa) return;

    ocultarMensaje();

    const idActual = grupoId.value;
    nombre.value = normalizarNombreGrupo(nombre.value);

    const problema = validarNombreGrupo(nombre.value, grupos, idActual);
    nombre.setCustomValidity(problema);
    avisoNombre.textContent = problema;
    formulario.classList.add('was-validated');

    if (problema) {
        nombre.focus();
        return;
    }

    const anterior = grupos.find(grupo => grupo.id === idActual);

    if (anterior && anterior.nombre === nombre.value) {
        limpiarFormulario();
        return;
    }

    cambiarOcupado(true);

    try {
        const consulta = idActual
            ? supabase.from('grupos_bus').update({ nombre: nombre.value })
                .eq('id', idActual).eq('cooperativa_id', cooperativa.id)
            : supabase.from('grupos_bus').insert({ nombre: nombre.value, cooperativa_id: cooperativa.id });

        const { error } = await consulta.select('id').single();
        if (error) throw error;

        const texto = idActual
            ? `Grupo renombrado a «${nombre.value}».` +
              (anterior?.buses ? ' Sus buses ya muestran el nombre nuevo.' : '')
            : `Grupo «${nombre.value}» creado.`;

        limpiarFormulario();
        await cargarGrupos();
        mostrarMensaje(texto, 'success');
    } catch (error) {
        console.error('Error al guardar el grupo:', error);
        mostrarMensaje(mensajeErrorGrupo(error, 'guardar'), 'danger');
    } finally {
        cambiarOcupado(false);
    }
}

async function eliminarGrupo(grupo) {
    if (ocupado || grupo.buses > 0) return;

    if (!window.confirm(`¿Deseas eliminar el grupo «${grupo.nombre}»?`)) return;

    ocultarMensaje();
    cambiarOcupado(true);

    try {
        const { error } = await supabase
            .from('grupos_bus')
            .delete()
            .eq('id', grupo.id)
            .eq('cooperativa_id', cooperativa.id)
            .select('id')
            .single();

        if (error) throw error;

        if (grupoId.value === grupo.id) limpiarFormulario();

        await cargarGrupos();
        mostrarMensaje(`Grupo «${grupo.nombre}» eliminado.`, 'success');
    } catch (error) {
        console.error('Error al eliminar el grupo:', error);
        mostrarMensaje(mensajeErrorGrupo(error, 'eliminar'), 'danger');
        // Puede que otro usuario le haya agregado buses: se actualiza la tabla.
        await cargarGrupos().catch(() => {});
    } finally {
        cambiarOcupado(false);
    }
}

async function obtenerCooperativa() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const { data, error } = await supabase
        .from('cooperativas_usuarios')
        .select('cooperativa_id, cooperativas(nombre)')
        .eq('perfil_id', session.user.id)
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return { id: data.cooperativa_id, nombre: data.cooperativas?.nombre ?? 'tu cooperativa' };
}

formulario.addEventListener('submit', guardar);
botonCancelar.addEventListener('click', limpiarFormulario);
nombre.addEventListener('input', () => nombre.setCustomValidity(''));

async function iniciar() {
    mostrarEstadoTabla('Comprobando acceso...');

    try {
        const rol = await exigirRoles(['cooperativa']);
        if (!rol) return;

        cooperativa = await obtenerCooperativa();

        if (!cooperativa) {
            mostrarMensaje('Tu cuenta aún no tiene una cooperativa asignada. Contacta al administrador.', 'warning');
            mostrarEstadoTabla('Sin cooperativa asignada.');
            return;
        }

        nombreCoop.textContent = cooperativa.nombre;
        await cargarGrupos();
    } catch (error) {
        console.error('Error al cargar los grupos:', error);
        mostrarMensaje('No se pudieron cargar los grupos. Revisa tu conexión y vuelve a intentar.', 'danger');
        mostrarEstadoTabla('No se pudo cargar el listado de grupos.');
    } finally {
        cambiarOcupado(false);
    }
}

iniciar();

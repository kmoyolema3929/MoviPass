// frontend/js/perfil.js
// "Mi perfil" (cambio 3, parte 3.1), para todos los roles: ver y editar los
// datos propios. El rol y el correo no se cambian aquí. La cédula solo se
// puede corregir si la guardada no es válida (perfiles antiguos).
// La base revisa lo mismo (actualizar_mi_perfil y validar_perfil).

import { supabase } from './supabaseClient.js';
import { mostrarAlerta } from './alertas.js';
import { exigirRoles } from './guardas.js';
import { PANEL_POR_ROL, obtenerPerfilPropio } from './auth.js';
import { cedulaValida } from './validaciones.js';
import {
    NOMBRES_CAMPOS, fechaMaximaNacimiento, limpiarTexto, pendientesDelPerfil, revisarDatosPersona,
    revisarNombre, textoEdad
} from './reglasCuenta.js';
import { mensajeErrorBase } from './erroresBase.js';
import { conBotonOcupado, limpiarAlEscribir, mostrarErrores, soloDigitos } from './formularios.js';

const ROLES = ['administrador', 'cooperativa', 'oficinista', 'cliente', 'bus'];
const NOMBRES_ROL = {
    administrador: 'Administrador',
    cooperativa: 'Gerente de cooperativa',
    oficinista: 'Oficinista',
    cliente: 'Cliente',
    bus: 'Usuario bus'
};

const $ = id => document.getElementById(id);
const form = $('formPerfil');
const btnGuardar = $('btnGuardar');
const campos = {
    cedula: $('cedulaInput'),
    nombres: $('nombresInput'),
    apellidos: $('apellidosInput'),
    fecha_nacimiento: $('fechaNacimientoInput'),
    telefono: $('telefonoInput')
};

let perfil = null;
let sugerencia = null;
const veniaACompletar = new URLSearchParams(window.location.search).get('completar') === '1';

function pintarEdad() {
    const edad = textoEdad(campos.fecha_nacimiento.value);
    $('edadTexto').textContent = edad ? `Edad: ${edad}.` : 'Debes ser mayor de 18 años.';
}

function pintarPendientes() {
    const pendientes = pendientesDelPerfil(perfil);
    const aviso = $('avisoCompletar');

    aviso.classList.toggle('d-none', pendientes.length === 0);
    if (pendientes.length) {
        const lista = pendientes.map(campo => NOMBRES_CAMPOS[campo]).join(', ');
        aviso.textContent = `Antes de continuar, completa o corrige estos datos de tu cuenta: ${lista}.`;
    }

    return pendientes;
}

/** Nombres del boleto más reciente de la cédula de esta cuenta (si hay). */
async function buscarNombresDeBoleto() {
    $('sugerenciaBoleto').classList.add('d-none');
    sugerencia = null;

    if (!cedulaValida(String(perfil.cedula ?? ''))) return;

    try {
        const { data, error } = await supabase.rpc('nombres_de_mi_ultimo_boleto', { p_cedula: perfil.cedula });
        if (error) throw error;
        if (!data?.nombres) return;

        const nombres = limpiarTexto(data.nombres);
        const apellidos = limpiarTexto(data.apellidos);
        const actuales = [limpiarTexto(campos.nombres.value), limpiarTexto(campos.apellidos.value)];

        if (actuales[0] === nombres && actuales[1] === apellidos) return;

        // Si los nombres guardados no son válidos, se precargan directamente.
        if (revisarNombre(actuales[0]) || revisarNombre(actuales[1], 'apellidos')) {
            campos.nombres.value = nombres;
            campos.apellidos.value = apellidos;
            mostrarAlerta('Completamos tus nombres con los de tu boleto más reciente. Revísalos y guarda.', 'info');
            return;
        }

        sugerencia = { nombres, apellidos };
        $('sugerenciaTexto').textContent = `Tu boleto más reciente está a nombre de ${nombres} ${apellidos}.`;
        $('sugerenciaBoleto').classList.remove('d-none');
    } catch (error) {
        // La sugerencia es opcional: si falla, el perfil se usa igual.
        console.error('No se pudieron leer los nombres del último boleto:', error);
    }
}

function pintarPerfil() {
    $('correoTexto').textContent = perfil.correo || '—';
    $('rolTexto').textContent = NOMBRES_ROL[perfil.rol] ?? perfil.rol;
    $('enlacePanel').href = PANEL_POR_ROL[perfil.rol] ?? '../index.html';

    campos.cedula.value = perfil.cedula ?? '';
    campos.nombres.value = perfil.nombres ?? '';
    campos.apellidos.value = perfil.apellidos ?? '';
    campos.fecha_nacimiento.value = perfil.fecha_nacimiento ?? '';
    campos.telefono.value = perfil.telefono ?? '';

    // La cédula solo se corrige si la guardada no es válida.
    const corregirCedula = !cedulaValida(String(perfil.cedula ?? ''));
    campos.cedula.readOnly = !corregirCedula;
    $('ayudaCedula').textContent = corregirCedula
        ? 'La cédula guardada no es válida: escríbela de nuevo.'
        : 'La cédula no se puede cambiar.';

    pintarEdad();
    pintarPendientes();
}

async function cargar() {
    perfil = await obtenerPerfilPropio();
    if (!perfil) return;

    pintarPerfil();
    btnGuardar.disabled = false;
    await buscarNombresDeBoleto();
}

$('btnUsarBoleto').addEventListener('click', () => {
    if (!sugerencia) return;
    campos.nombres.value = sugerencia.nombres;
    campos.apellidos.value = sugerencia.apellidos;
    $('sugerenciaBoleto').classList.add('d-none');
    campos.nombres.focus();
});

form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!perfil) return;

    const datos = Object.fromEntries(Object.entries(campos).map(([clave, campo]) => [clave, campo.value]));
    if (!mostrarErrores(form, revisarDatosPersona(datos))) return;

    await conBotonOcupado(btnGuardar, 'Guardando...', async () => {
        try {
            const { error } = await supabase.rpc('actualizar_mi_perfil', {
                p_cedula: limpiarTexto(datos.cedula),
                p_nombres: limpiarTexto(datos.nombres),
                p_apellidos: limpiarTexto(datos.apellidos),
                p_telefono: limpiarTexto(datos.telefono) || null,
                p_fecha_nacimiento: datos.fecha_nacimiento
            });

            if (error) throw error;

            const teniaPendientes = pendientesDelPerfil(perfil).length > 0;
            perfil = await obtenerPerfilPropio();

            if ((veniaACompletar || teniaPendientes) && pendientesDelPerfil(perfil).length === 0) {
                window.location.replace(PANEL_POR_ROL[perfil.rol] ?? '../index.html');
                return true;
            }

            pintarPerfil();
            mostrarAlerta('Tus datos se guardaron.', 'success');
            await buscarNombresDeBoleto();
            return false;
        } catch (error) {
            console.error('No se pudo guardar el perfil:', error);
            const mensaje = mensajeErrorBase(error, 'guardar tus datos');

            // Cédula repetida: el mensaje va junto al campo.
            if (error?.code === '23505') mostrarErrores(form, { cedula: mensaje });
            else mostrarAlerta(mensaje, 'danger');
            return false;
        }
    });
});

campos.fecha_nacimiento.max = fechaMaximaNacimiento();
campos.fecha_nacimiento.addEventListener('input', pintarEdad);
soloDigitos(campos.cedula);
soloDigitos(campos.telefono);
limpiarAlEscribir(form);

// Todos los roles; esta página es la única que se abre con datos pendientes.
const rol = await exigirRoles(ROLES, undefined, undefined, { permitirIncompleto: true });

if (rol) {
    try {
        await cargar();
    } catch (error) {
        console.error('No se pudo cargar el perfil:', error);
        mostrarAlerta(mensajeErrorBase(error, 'cargar tu perfil'), 'danger');
    }
}

// frontend/js/gerentes.js
// El administrador crea la cuenta del gerente de una cooperativa (cambio 3:
// antes este código estaba dentro de gestor-gerentes.html). Usa el mismo
// mecanismo que el personal (cuentasPersonal.js) y las mismas reglas
// (fecha de nacimiento, mayor de 18 años, teléfono opcional).

import { supabase } from './supabaseClient.js';
import { mostrarAlerta } from './alertas.js';
import { exigirRoles } from './guardas.js';
import { llenarCombo } from './combos.js';
import { crearCuentaPersonal } from './cuentasPersonal.js';
import { mensajeErrorCuenta, revisarPersona } from './personal.js';
import { fechaMaximaNacimiento } from './reglasCuenta.js';
import { conBotonOcupado, limpiarAlEscribir, mostrarErrores, soloDigitos } from './formularios.js';

const form = document.getElementById('formGerente');
const selectCoop = document.getElementById('cooperativa');
const btn = document.getElementById('btnGuardar');
const campos = ['nombres', 'apellidos', 'cedula', 'fecha_nacimiento', 'telefono', 'email', 'password']
    .reduce((todos, id) => ({ ...todos, [id]: document.getElementById(id) }), {});

function cargarCooperativas() {
    return llenarCombo(selectCoop, {
        cargar: async () => {
            const { data, error } = await supabase.from('cooperativas').select('id, nombre').order('nombre');
            if (error) throw error;
            return data;
        },
        inicial: 'Selecciona una cooperativa...',
        vacio: 'No hay cooperativas registradas',
        error: 'No se pudieron cargar las cooperativas.',
    });
}

campos.fecha_nacimiento.max = fechaMaximaNacimiento();
soloDigitos(campos.cedula);
soloDigitos(campos.telefono);
limpiarAlEscribir(form);

form.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const datos = Object.fromEntries(Object.entries(campos).map(([clave, campo]) => [clave, campo.value]));
    const errores = revisarPersona(datos);
    if (!selectCoop.value) errores.cooperativa = 'Elige la cooperativa.';

    if (!mostrarErrores(form, errores)) return;

    await conBotonOcupado(btn, 'Creando usuario...', async () => {
        try {
            await crearCuentaPersonal({ datos, cooperativaId: selectCoop.value, rol: 'cooperativa' });

            mostrarAlerta('¡Gerente creado y asignado! Le llegará un código a su correo: lo escribirá la primera vez que entre.', 'success');
            // Vuelve a la opción por defecto ("Selecciona..." o la única cooperativa).
            form.reset();
        } catch (error) {
            console.error(error);
            mostrarAlerta(mensajeErrorCuenta(error), 'danger');
        }
        return false;
    });
});

// Solo el administrador puede ver esta página.
const rol = await exigirRoles(['administrador']);
if (rol) cargarCooperativas();

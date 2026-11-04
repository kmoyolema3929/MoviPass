import { supabase } from '../../js/supabaseClient.js';
import { exigirRoles } from '../../js/guardas.js';
import { obtenerContextoGestion, textoError } from '../../js/contextoUsuario.js';
import { mostrarAlerta } from '../../js/alertas.js';
import { formatearFecha, formatearHora, dinero } from '../../js/validaciones.js';

const LIMITE = 100;

const COLUMNAS = `
    id, metodo_pago, estado, total, creado_en, validado_en, motivo_rechazo,
    viajes ( fecha, frecuencias ( origen, destino, hora ) ),
    boletos ( numero_asiento, pasajero_nombres, pasajero_apellidos, pasajero_cedula, tipo_pasajero, precio, estado, codigo )
`;

const METODOS = { deposito: 'Depósito', transferencia: 'Transferencia', efectivo: 'Efectivo' };

const ESTADOS = {
    aprobada: ['Aprobada', 'bg-success'],
    rechazada: ['Rechazada', 'bg-danger'],
    vencida: ['Vencida', 'bg-secondary'],
    pendiente_validacion: ['Pendiente de validación', 'bg-warning text-dark'],
    pendiente_comprobante: ['Esperando comprobante', 'bg-info text-dark']
};

const $ = (id) => document.getElementById(id);
const tbody = $('tablaHistorial');

let idsCooperativas = [];

function elemento(etiqueta, clase, texto) {
    const el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    if (texto !== undefined) el.textContent = texto;
    return el;
}

function filaInformativa(texto, clase = 'text-muted') {
    tbody.replaceChildren();
    const tr = elemento('tr');
    const td = elemento('td', `text-center py-3 ${clase}`, texto);
    td.colSpan = 6;
    tr.appendChild(td);
    tbody.appendChild(tr);
}

function fechaHora(iso) {
    const f = new Date(iso);
    const dos = (n) => String(n).padStart(2, '0');
    return `${dos(f.getDate())}/${dos(f.getMonth() + 1)}/${f.getFullYear()} ${dos(f.getHours())}:${dos(f.getMinutes())}`;
}

async function buscar() {
    filaInformativa('Cargando...');

    let consulta = supabase
        .from('compras')
        .select(COLUMNAS)
        .in('cooperativa_id', idsCooperativas)
        .order('creado_en', { ascending: false })
        .limit(LIMITE);

    const estado = $('filtroEstado').value;
    const desde = $('filtroDesde').value;
    const hasta = $('filtroHasta').value;

    if (estado) consulta = consulta.eq('estado', estado);
    // Se convierte la hora local a UTC para que el filtro respete el día elegido
    if (desde) consulta = consulta.gte('creado_en', new Date(`${desde}T00:00:00`).toISOString());
    if (hasta) {
        const fin = new Date(`${hasta}T00:00:00`);
        fin.setDate(fin.getDate() + 1);
        consulta = consulta.lt('creado_en', fin.toISOString());
    }

    const { data, error } = await consulta;
    if (error) throw error;

    dibujar(data ?? []);
}

function dibujar(compras) {
    tbody.replaceChildren();

    if (compras.length === 0) {
        filaInformativa('No hay registros con esos filtros.');
        $('resumenLista').textContent = '';
        $('totalAprobado').textContent = '';
        return;
    }

    let totalAprobado = 0;

    compras.forEach((compra) => {
        if (compra.estado === 'aprobada') totalAprobado += Number(compra.total);

        const boletos = (compra.boletos ?? [])
            .filter((b) => b.estado !== 'anulado')
            .sort((a, b) => a.numero_asiento - b.numero_asiento);

        const v = compra.viajes;
        const [textoEstado, claseEstado] = ESTADOS[compra.estado] ?? [compra.estado, 'bg-secondary'];

        const tr = elemento('tr');
        const tdEstado = elemento('td');
        tdEstado.appendChild(elemento('span', `badge ${claseEstado}`, textoEstado));

        const tdBoletos = elemento('td', 'text-center');
        const btnDetalle = elemento('button', 'btn btn-sm btn-outline-primary', `Ver (${boletos.length})`);
        btnDetalle.type = 'button';
        btnDetalle.setAttribute('aria-expanded', 'false');
        tdBoletos.appendChild(btnDetalle);

        tr.append(
            elemento('td', '', fechaHora(compra.creado_en)),
            elemento('td', '', v
                ? `${v.frecuencias.origen} → ${v.frecuencias.destino} · ${formatearFecha(v.fecha)} ${formatearHora(v.frecuencias.hora)}`
                : '-'),
            elemento('td', '', METODOS[compra.metodo_pago] ?? compra.metodo_pago),
            tdEstado,
            elemento('td', 'text-end', dinero(compra.total)),
            tdBoletos
        );
        tbody.appendChild(tr);

        // Fila de detalle (se muestra al pulsar "Ver")
        const trDetalle = elemento('tr', 'd-none table-light');
        const tdDetalle = elemento('td');
        tdDetalle.colSpan = 6;

        if (compra.motivo_rechazo) {
            tdDetalle.appendChild(elemento('p', 'text-danger small mb-2', `Motivo del rechazo: ${compra.motivo_rechazo}`));
        }

        if (boletos.length === 0) {
            tdDetalle.appendChild(elemento('p', 'text-muted small mb-0', 'Sin boletos vigentes.'));
        } else {
            const tabla = elemento('table', 'table table-sm mb-0');
            const cuerpo = elemento('tbody');
            boletos.forEach((b) => {
                const fila = elemento('tr');
                fila.append(
                    elemento('td', '', `Asiento ${b.numero_asiento}`),
                    elemento('td', '', `${b.pasajero_nombres} ${b.pasajero_apellidos}`),
                    elemento('td', '', `C.I. ${b.pasajero_cedula}`),
                    elemento('td', '', dinero(b.precio)),
                    elemento('td', 'font-monospace', b.codigo ?? 'Sin emitir')
                );
                cuerpo.appendChild(fila);
            });
            tabla.appendChild(cuerpo);
            tdDetalle.appendChild(tabla);
        }

        trDetalle.appendChild(tdDetalle);
        tbody.appendChild(trDetalle);

        btnDetalle.addEventListener('click', () => {
            const oculto = trDetalle.classList.toggle('d-none');
            btnDetalle.setAttribute('aria-expanded', String(!oculto));
        });
    });

    $('resumenLista').textContent =
        compras.length === LIMITE ? `Se muestran los ${LIMITE} registros más recientes.` : `${compras.length} registro(s).`;
    $('totalAprobado').textContent = `Total de compras aprobadas: ${dinero(totalAprobado)}`;
}

async function ejecutarBusqueda() {
    try {
        await buscar();
    } catch (error) {
        console.error('Error al cargar el historial:', error);
        filaInformativa('No se pudo cargar el historial.', 'text-danger');
        mostrarAlerta(textoError(error), 'danger');
    }
}

$('btnBuscar').addEventListener('click', ejecutarBusqueda);

async function iniciar() {
    const rol = await exigirRoles(['oficinista']);
    if (!rol) return;

    try {
        const { cooperativas } = await obtenerContextoGestion();
        idsCooperativas = cooperativas.map((c) => c.id);

        if (idsCooperativas.length === 0) {
            filaInformativa('Tu cuenta aún no está asignada a una cooperativa. Contacta al administrador.', 'text-danger');
            return;
        }

        await ejecutarBusqueda();
    } catch (error) {
        console.error('Error al iniciar el historial:', error);
        filaInformativa('No se pudo cargar el historial.', 'text-danger');
        mostrarAlerta(textoError(error), 'danger');
    }
}

iniciar();

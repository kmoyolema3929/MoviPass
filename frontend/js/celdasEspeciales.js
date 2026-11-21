// frontend/js/celdasEspeciales.js
// Celdas de la plantilla que NO son asientos (por ahora solo el baño).
//
// Se guardan en plantillas_bus.distribucion, dentro de cada piso:
//   "celdas_especiales": [{ "fila": 11, "columna": 3, "tipo": "bano" }]
// Un piso sin celdas especiales no lleva la lista (las plantillas antiguas
// siguen igual). Más adelante se podrán agregar otros tipos en TIPOS_CELDA
// (puerta, escalera, cabina, pasillo) con el mismo formato.
//
// En cada piso, "cantidad" es el número de celdas de la cuadrícula
// (asientos + celdas especiales). Los asientos se numeran en orden y se
// saltan las celdas especiales, igual que guardar_plantilla_bus.

export const TIPOS_CELDA = {
    bano: { nombre: 'Baño', icono: '🚻' }
};

export function clavePosicion(fila, columna) {
    return `${fila}-${columna}`;
}

/** Posiciones (fila, columna) de las celdas de un piso, en orden. */
export function posicionesDePiso({ cantidad, filas, columnas, ultima_fila_5 }) {
    const total = Number.isInteger(cantidad) && cantidad > 0 ? cantidad : 0;

    return Array.from({ length: total }, function (_, indice) {
        // La última fila de 5 ocupa también el hueco del pasillo: columnas 1 a 5.
        const enFilaDeCinco = ultima_fila_5 === true && indice >= (filas - 1) * 4;

        return {
            fila: enFilaDeCinco ? filas : Math.floor(indice / columnas) + 1,
            columna: enFilaDeCinco ? indice - (filas - 1) * 4 + 1 : (indice % columnas) + 1
        };
    });
}

/** Celdas especiales de un piso (lista vacía si no tiene). */
export function celdasEspecialesDe(piso) {
    return Array.isArray(piso?.celdas_especiales) ? piso.celdas_especiales : [];
}

/** Celdas especiales de una distribución guardada, por número de piso. */
export function especialesPorPiso(distribucion) {
    const resultado = new Map();

    if (!Array.isArray(distribucion)) return resultado;

    distribucion.forEach(function (piso, indice) {
        const celdas = celdasEspecialesDe(piso).filter(function (celda) {
            return TIPOS_CELDA[celda?.tipo] &&
                Number.isInteger(celda.fila) &&
                Number.isInteger(celda.columna);
        });

        if (celdas.length) resultado.set(indice + 1, celdas);
    });

    return resultado;
}

/** Revisa las celdas especiales de un piso. Devuelve '' si están bien o el problema. */
export function validarCeldasEspeciales(piso, numeroPiso) {
    const celdas = piso?.celdas_especiales ?? [];

    if (!Array.isArray(celdas)) {
        return `Las celdas especiales del piso ${numeroPiso} no son válidas.`;
    }

    const posiciones = new Set(
        posicionesDePiso(piso).map(p => clavePosicion(p.fila, p.columna))
    );
    const vistas = new Set();

    for (const celda of celdas) {
        if (!celda || !TIPOS_CELDA[celda.tipo]) {
            return `Hay una celda de tipo no válido en el piso ${numeroPiso}.`;
        }

        const clave = clavePosicion(celda.fila, celda.columna);
        const nombre = TIPOS_CELDA[celda.tipo].nombre;

        if (!Number.isInteger(celda.fila) || !Number.isInteger(celda.columna) || !posiciones.has(clave)) {
            return `${nombre} del piso ${numeroPiso} (fila ${celda.fila}, columna ${celda.columna}) ` +
                'está fuera de la distribución.';
        }

        if (vistas.has(clave)) {
            return `La celda de la fila ${celda.fila}, columna ${celda.columna} del piso ` +
                `${numeroPiso} está repetida.`;
        }

        vistas.add(clave);
    }

    if (posiciones.size > 0 && vistas.size >= posiciones.size) {
        return `El piso ${numeroPiso} debe tener al menos un asiento.`;
    }

    return '';
}

/**
 * Asientos de todos los pisos, numerados en orden y sin las celdas especiales.
 * Devuelve una lista de asientos por piso. En buses de dos pisos el piso 1 es VIP.
 */
export function generarAsientos(pisos) {
    let siguiente = 1;

    return pisos.map(function (piso, indice) {
        const numeroPiso = indice + 1;
        const tipo = pisos.length === 2 && numeroPiso === 1 ? 'vip' : 'normal';
        const especiales = new Set(
            celdasEspecialesDe(piso).map(c => clavePosicion(c.fila, c.columna))
        );

        return posicionesDePiso(piso)
            .filter(p => !especiales.has(clavePosicion(p.fila, p.columna)))
            .map(p => ({ numero: siguiente++, piso: numeroPiso, fila: p.fila, columna: p.columna, tipo }));
    });
}

/** Celda especial bloqueada para los mapas de venta (no se puede elegir). */
export function crearCeldaEspecial(celda, clase) {
    const tipo = TIPOS_CELDA[celda.tipo];
    const elemento = document.createElement('div');

    elemento.className = clase;
    elemento.textContent = tipo.icono;
    elemento.title = `${tipo.nombre} (no es un asiento)`;
    elemento.setAttribute('role', 'img');
    elemento.setAttribute('aria-label', `${tipo.nombre}, no disponible`);

    return elemento;
}

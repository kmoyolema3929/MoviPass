// frontend/js/celdasEspeciales.js
// Celdas de la plantilla que NO son asientos: baño (cambio 11), puerta,
// escalera, cabina, pasillo y espacio vacío (cambio 6). El espacio vacío
// permite filas de distinto ancho: en los mapas no se dibuja nada.
//
// Se guardan en plantillas_bus.distribucion, dentro de cada piso:
//   "celdas_especiales": [{ "fila": 11, "columna": 3, "tipo": "bano" }]
//
// En cada piso, "cantidad" es el número de celdas de la cuadrícula
// (asientos + celdas especiales). En el formato antiguo los asientos se
// numeraban en orden saltando las celdas especiales (generarAsientos). En el
// formato 2 (editor visual, ver editorPlantilla.js) cada asiento guarda su
// número y su tipo en la lista "asientos" del piso.

export const TIPOS_CELDA = {
    bano: { nombre: 'Baño', icono: '🚻' },
    puerta: { nombre: 'Puerta', icono: '🚪' },
    escalera: { nombre: 'Escalera', icono: '🪜' },
    cabina: { nombre: 'Cabina del conductor', icono: '🛞' },
    pasillo: { nombre: 'Pasillo', icono: '' },
    vacio: { nombre: 'Espacio vacío', icono: '' }
};

// Tipos de asiento. El bloqueado existe y conserva su número, pero no se
// vende ni cuenta en la capacidad (la base rechaza venderlo).
export const TIPOS_ASIENTO = {
    normal: { nombre: 'Asiento normal' },
    vip: { nombre: 'Asiento VIP' },
    cama: { nombre: 'Cama' },
    bloqueado: { nombre: 'Asiento bloqueado', icono: '🔒' }
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

/**
 * Ancho de cada columna de un mapa de venta: las columnas que en todas las
 * filas son pasillo se dibujan angostas (como el pasillo central de antes).
 */
export function columnasDelMapa(columnas, filas, especialesPiso, ancho, anchoPasillo) {
    const pasillo = new Set(
        especialesPiso.filter(c => c.tipo === 'pasillo').map(c => clavePosicion(c.fila, c.columna))
    );

    return Array.from({ length: columnas }, (_, i) => {
        const soloPasillo = filas.length > 0 && filas.every(fila => pasillo.has(clavePosicion(fila, i + 1)));
        return soloPasillo ? anchoPasillo : ancho;
    }).join(' ');
}

/** Clase CSS de un asiento en los mapas de venta según su tipo. */
export function claseTipoAsiento(tipo) {
    return tipo === 'vip' || tipo === 'cama' || tipo === 'bloqueado' ? ` ${tipo}` : '';
}

/**
 * Asiento bloqueado en los mapas de venta: se ve con su número y un candado,
 * siempre deshabilitado (no se registra entre los botones que se pueden elegir).
 */
export function crearAsientoBloqueado(asiento, clase) {
    const boton = document.createElement('button');

    boton.type = 'button';
    boton.className = clase;
    boton.disabled = true;
    boton.textContent = `🔒${asiento.numero}`;
    boton.title = `Asiento ${asiento.numero} (bloqueado, no se vende)`;
    boton.setAttribute('aria-label', `Asiento ${asiento.numero}, bloqueado, no disponible`);

    return boton;
}

/** Celda especial bloqueada para los mapas de venta (no se puede elegir). */
export function crearCeldaEspecial(celda, clase) {
    const tipo = TIPOS_CELDA[celda.tipo];
    const elemento = document.createElement('div');

    // El pasillo y el espacio vacío no muestran nada.
    if (celda.tipo === 'pasillo' || celda.tipo === 'vacio') {
        elemento.setAttribute('aria-hidden', 'true');
        return elemento;
    }

    elemento.className = clase;
    elemento.textContent = tipo.icono;
    elemento.title = `${tipo.nombre} (no es un asiento)`;
    elemento.setAttribute('role', 'img');
    elemento.setAttribute('aria-label', `${tipo.nombre}, no disponible`);

    return elemento;
}

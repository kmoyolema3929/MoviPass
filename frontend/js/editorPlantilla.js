// frontend/js/editorPlantilla.js
// Modelo del editor visual de plantillas (cambio 6, parte 2). Sin DOM ni
// Supabase: lo usa la pantalla "Mis plantillas" y se prueba con node --test.
//
// Formato 2 de la distribución (lo que se guarda en plantillas_bus):
//   [{ numero: 1, formato: 2, filas, columnas, cantidad: filas × columnas,
//      celdas_especiales: [{ fila, columna, tipo: bano|puerta|escalera|cabina|pasillo|vacio }],
//      asientos: [{ fila, columna, numero, tipo: normal|vip|cama|bloqueado }] }, ...]
// Toda celda de la cuadrícula es un asiento o una celda especial. Las filas
// más cortas terminan en "vacio" (espacio vacío). El asiento bloqueado tiene
// número pero no se vende ni cuenta en la capacidad. La base
// (validar_distribucion_plantilla) revisa las mismas reglas.
//
// Modelo en memoria: { pisos: [ { celdas: [[celda, ...], ...] } ] }
//   celda de asiento:  { tipo: 'asiento', clase: 'normal'|'vip'|'cama'|'bloqueado', numero, fijo }
//   celda especial:    { tipo: 'bano'|'puerta'|'escalera'|'cabina'|'pasillo'|'vacio' }
// "fijo" = el número no cambia al renumerar (lo escribió el gerente o ya
// estaba guardado). Los asientos nuevos se numeran solos con los números
// libres, en orden: piso, fila y columna.

import { TIPOS_ASIENTO, TIPOS_CELDA } from './celdasEspeciales.js';

export const LIMITES = { filas: 20, columnas: 8, asientos: 60, minimoDosPisos: 40 };

/** Herramientas del editor: tipos de asiento y de celda especial. */
export const HERRAMIENTAS = [
    ...Object.entries(TIPOS_ASIENTO).map(([clave, t]) => ({ clave, nombre: t.nombre, icono: t.icono ?? '', asiento: true })),
    ...Object.entries(TIPOS_CELDA).map(([clave, t]) => ({ clave, nombre: t.nombre, icono: t.icono, asiento: false }))
];

const esAsiento = celda => celda?.tipo === 'asiento';
const esVendible = celda => esAsiento(celda) && celda.clase !== 'bloqueado';
const vacio = () => ({ tipo: 'vacio' });
const asientoNuevo = (clase = 'normal') => ({ tipo: 'asiento', clase, numero: null, fijo: false });

function clonar(modelo) {
    return { pisos: modelo.pisos.map(piso => ({ celdas: piso.celdas.map(fila => fila.map(c => ({ ...c }))) })) };
}

function recorrer(modelo, accion) {
    modelo.pisos.forEach((piso, p) => piso.celdas.forEach((fila, f) => fila.forEach((celda, c) => accion(celda, p, f, c))));
}

/** Numera los asientos que no tienen número fijo con los números libres, en orden. */
export function renumerar(modelo) {
    const nuevo = clonar(modelo);
    const usados = new Set();

    recorrer(nuevo, celda => {
        if (esAsiento(celda) && celda.fijo && Number.isInteger(celda.numero)) usados.add(celda.numero);
    });

    let siguiente = 1;

    recorrer(nuevo, celda => {
        if (!esAsiento(celda) || (celda.fijo && Number.isInteger(celda.numero))) return;

        while (usados.has(siguiente)) siguiente++;
        celda.numero = siguiente;
        celda.fijo = false;
        usados.add(siguiente);
    });

    return nuevo;
}

/** Vuelve a numerar todos los asientos en orden (1, 2, 3...). */
export function renumerarTodo(modelo) {
    const nuevo = clonar(modelo);
    recorrer(nuevo, celda => { if (esAsiento(celda)) celda.fijo = false; });
    return renumerar(nuevo);
}

function pisoNuevo(filas, columnas, clase, pasillo) {
    return {
        celdas: Array.from({ length: filas }, () =>
            Array.from({ length: columnas }, (_, c) => (c === pasillo ? { tipo: 'pasillo' } : asientoNuevo(clase))))
    };
}

/**
 * Plantilla nueva: 2 asientos, pasillo y 2 asientos por fila.
 * Un piso: 10 filas (40 asientos). Dos pisos: abajo 5 filas VIP (20) y arriba 10 filas (40).
 */
export function crearModeloNuevo(numeroPisos = 1) {
    const pisos = numeroPisos === 2
        ? [pisoNuevo(5, 5, 'vip', 2), pisoNuevo(10, 5, 'normal', 2)]
        : [pisoNuevo(10, 5, 'normal', 2)];

    return renumerar({ pisos });
}

/**
 * Cambia a 1 o 2 pisos. El segundo piso nuevo tiene 5 filas con las mismas
 * columnas del primero (y sus columnas de pasillo).
 */
export function cambiarNumeroPisos(modelo, numeroPisos) {
    const nuevo = clonar(modelo);

    if (numeroPisos === 1) {
        nuevo.pisos = nuevo.pisos.slice(0, 1);
    } else if (nuevo.pisos.length === 1) {
        const base = nuevo.pisos[0].celdas;
        const columnas = base[0].length;
        const pasillos = new Set(
            Array.from({ length: columnas }, (_, c) => c).filter(c => base.every(fila => fila[c].tipo === 'pasillo'))
        );

        nuevo.pisos.push({
            celdas: Array.from({ length: 5 }, () =>
                Array.from({ length: columnas }, (_, c) => (pasillos.has(c) ? { tipo: 'pasillo' } : asientoNuevo())))
        });
    }

    return renumerar(nuevo);
}

// ---------------------------------------------------------------------
// Leer una distribución guardada
// ---------------------------------------------------------------------

/**
 * Convierte una distribución antigua (cantidad/filas/columnas/ultima_fila_5)
 * al formato 2 sin cambiar ningún número de asiento: igual que
 * convertir_distribucion_antigua en la base.
 */
export function convertirDistribucionAntigua(distribucion) {
    let siguiente = 1;

    return distribucion.map((piso, indice) => {
        const filas = piso.filas;
        const central = piso.ultima_fila_5 === true;
        const conPasillo = piso.columnas === 4;
        const columnas = conPasillo ? 5 : piso.columnas;
        const tipo = distribucion.length === 2 && indice === 0 ? 'vip' : 'normal';
        const mover = (fila, columna) =>
            (conPasillo && !(central && fila === filas) && columna >= 3 ? columna + 1 : columna);

        const banos = (Array.isArray(piso.celdas_especiales) ? piso.celdas_especiales : [])
            .map(c => ({ fila: c.fila, columna: mover(c.fila, c.columna), tipo: 'bano', original: `${c.fila}-${c.columna}` }));
        const originales = new Set(banos.map(b => b.original));

        const asientos = [];
        for (let pos = 1; pos <= piso.cantidad; pos++) {
            const enFilaDeCinco = central && pos > (filas - 1) * 4;
            const fila = enFilaDeCinco ? filas : Math.floor((pos - 1) / piso.columnas) + 1;
            const columna = enFilaDeCinco ? pos - (filas - 1) * 4 : ((pos - 1) % piso.columnas) + 1;

            if (originales.has(`${fila}-${columna}`)) continue;
            asientos.push({ fila, columna: mover(fila, columna), numero: siguiente++, tipo });
        }

        const ocupadas = new Set([...asientos, ...banos].map(c => `${c.fila}-${c.columna}`));
        const especiales = banos.map(({ fila, columna, tipo: t }) => ({ fila, columna, tipo: t }));

        for (let f = 1; f <= filas; f++) {
            for (let c = 1; c <= columnas; c++) {
                if (!ocupadas.has(`${f}-${c}`)) especiales.push({ fila: f, columna: c, tipo: 'pasillo' });
            }
        }

        const orden = (a, b) => a.fila - b.fila || a.columna - b.columna;

        return {
            numero: indice + 1,
            formato: 2,
            filas,
            columnas,
            cantidad: filas * columnas,
            celdas_especiales: especiales.sort(orden),
            asientos: asientos.sort(orden)
        };
    });
}

/** Modelo del editor a partir de una distribución guardada (cualquier formato). */
export function desdeDistribucion(distribucion) {
    if (!Array.isArray(distribucion) || distribucion.length === 0) return crearModeloNuevo(1);

    const formato2 = distribucion.every(piso => piso?.formato === 2)
        ? distribucion
        : convertirDistribucionAntigua(distribucion);

    return {
        pisos: formato2.map(piso => {
            const celdas = Array.from({ length: piso.filas }, () =>
                Array.from({ length: piso.columnas }, () => ({ tipo: 'pasillo' })));

            (piso.celdas_especiales ?? []).forEach(c => {
                if (TIPOS_CELDA[c.tipo] && celdas[c.fila - 1]?.[c.columna - 1]) celdas[c.fila - 1][c.columna - 1] = { tipo: c.tipo };
            });

            (piso.asientos ?? []).forEach(a => {
                if (celdas[a.fila - 1]?.[a.columna - 1]) {
                    celdas[a.fila - 1][a.columna - 1] = {
                        tipo: 'asiento',
                        clase: TIPOS_ASIENTO[a.tipo] ? a.tipo : 'normal',
                        numero: a.numero,
                        fijo: true
                    };
                }
            });

            return { celdas };
        })
    };
}

/** Distribución en formato 2 para guardar (mismo orden que la base). */
export function aDistribucion(modelo) {
    return modelo.pisos.map((piso, indice) => {
        const filas = piso.celdas.length;
        const columnas = piso.celdas[0]?.length ?? 0;
        const celdasEspeciales = [];
        const asientos = [];

        piso.celdas.forEach((fila, f) => fila.forEach((celda, c) => {
            if (esAsiento(celda)) {
                asientos.push({ fila: f + 1, columna: c + 1, numero: celda.numero, tipo: celda.clase });
            } else {
                celdasEspeciales.push({ fila: f + 1, columna: c + 1, tipo: celda.tipo });
            }
        }));

        return {
            numero: indice + 1,
            formato: 2,
            filas,
            columnas,
            cantidad: filas * columnas,
            celdas_especiales: celdasEspeciales,
            asientos
        };
    });
}

// ---------------------------------------------------------------------
// Edición
// ---------------------------------------------------------------------

/** Cambia el tipo de una celda (herramienta = clave de HERRAMIENTAS). */
export function cambiarCelda(modelo, piso, fila, columna, herramienta) {
    const nuevo = clonar(modelo);
    const actual = nuevo.pisos[piso]?.celdas[fila]?.[columna];

    if (!actual) return modelo;

    if (TIPOS_ASIENTO[herramienta]) {
        nuevo.pisos[piso].celdas[fila][columna] = esAsiento(actual)
            ? { ...actual, clase: herramienta }
            : asientoNuevo(herramienta);
    } else if (TIPOS_CELDA[herramienta]) {
        nuevo.pisos[piso].celdas[fila][columna] = { tipo: herramienta };
    } else {
        return modelo;
    }

    return renumerar(nuevo);
}

/** Inserta una fila antes de "indice" (o al final). Las columnas de pasillo siguen siendo pasillo. */
export function insertarFila(modelo, piso, indice) {
    const nuevo = clonar(modelo);
    const celdas = nuevo.pisos[piso].celdas;

    if (celdas.length >= LIMITES.filas) return modelo;

    const columnas = celdas[0].length;
    const igual = (c, tipo) => celdas.every(fila => fila[c].tipo === tipo);
    const filaNueva = Array.from({ length: columnas }, (_, c) =>
        (igual(c, 'pasillo') ? { tipo: 'pasillo' } : igual(c, 'vacio') ? vacio() : asientoNuevo()));

    celdas.splice(Math.max(0, Math.min(indice, celdas.length)), 0, filaNueva);
    return renumerar(nuevo);
}

export function quitarFila(modelo, piso, indice) {
    const nuevo = clonar(modelo);
    const celdas = nuevo.pisos[piso].celdas;

    if (celdas.length <= 1 || !celdas[indice]) return modelo;

    celdas.splice(indice, 1);
    return renumerar(nuevo);
}

/** Inserta una columna de asientos antes de "indice" (o al final). */
export function insertarColumna(modelo, piso, indice) {
    const nuevo = clonar(modelo);
    const celdas = nuevo.pisos[piso].celdas;

    if (celdas[0].length >= LIMITES.columnas) return modelo;

    const posicion = Math.max(0, Math.min(indice, celdas[0].length));
    celdas.forEach(fila => fila.splice(posicion, 0, asientoNuevo()));
    return renumerar(nuevo);
}

export function quitarColumna(modelo, piso, indice) {
    const nuevo = clonar(modelo);
    const celdas = nuevo.pisos[piso].celdas;

    if (celdas[0].length <= 1 || indice < 0 || indice >= celdas[0].length) return modelo;

    celdas.forEach(fila => fila.splice(indice, 1));
    return renumerar(nuevo);
}

/** Cantidad de celdas de una fila sin contar los espacios vacíos del final. */
export function largoDeFila(fila) {
    let largo = fila.length;
    while (largo > 0 && fila[largo - 1].tipo === 'vacio') largo--;
    return largo;
}

/** Quita las columnas del final que son espacio vacío en todas las filas (deja al menos 1). */
function recortarColumnas(celdas) {
    while (celdas[0].length > 1 && celdas.every(fila => fila[fila.length - 1].tipo === 'vacio')) {
        celdas.forEach(fila => fila.pop());
    }
}

/**
 * Agrega un asiento al final de UNA fila. Si la fila ya ocupa todo el ancho,
 * se agrega una columna y en las demás filas esa celda queda como espacio vacío.
 */
export function agregarCeldaEnFila(modelo, piso, indiceFila) {
    const nuevo = clonar(modelo);
    const celdas = nuevo.pisos[piso]?.celdas;
    const fila = celdas?.[indiceFila];

    if (!fila) return modelo;

    const largo = largoDeFila(fila);

    if (largo >= fila.length) {
        if (fila.length >= LIMITES.columnas) return modelo;
        celdas.forEach(otra => otra.push(vacio()));
    }

    fila[largo] = asientoNuevo();
    return renumerar(nuevo);
}

/** Quita la última celda de UNA fila (queda como espacio vacío). */
export function quitarCeldaEnFila(modelo, piso, indiceFila) {
    const nuevo = clonar(modelo);
    const celdas = nuevo.pisos[piso]?.celdas;
    const fila = celdas?.[indiceFila];

    if (!fila) return modelo;

    const largo = largoDeFila(fila);
    if (largo === 0) return modelo;

    fila[largo - 1] = vacio();
    recortarColumnas(celdas);
    return renumerar(nuevo);
}

/**
 * Cambia el número de un asiento. Devuelve { modelo, error }.
 * El número queda fijo; no se puede repetir.
 */
export function cambiarNumero(modelo, piso, fila, columna, texto) {
    const celda = modelo.pisos[piso]?.celdas[fila]?.[columna];

    if (!esAsiento(celda)) return { modelo, error: 'Esa celda no es un asiento.' };

    const numero = Number(String(texto ?? '').trim());

    if (!Number.isInteger(numero) || numero < 1 || numero > LIMITES.asientos) {
        return { modelo, error: `Escribe un número entero del 1 al ${LIMITES.asientos}.` };
    }

    let repetido = null;
    recorrer(modelo, (otra, p, f, c) => {
        if (esAsiento(otra) && otra.numero === numero && !(p === piso && f === fila && c === columna)) {
            repetido = { piso: p + 1, fila: f + 1, columna: c + 1 };
        }
    });

    if (repetido) {
        return {
            modelo,
            error: `El número ${numero} ya lo tiene otro asiento` +
                (modelo.pisos.length > 1 ? ` (piso ${repetido.piso}, fila ${repetido.fila}).` : ` (fila ${repetido.fila}).`)
        };
    }

    const nuevo = clonar(modelo);
    nuevo.pisos[piso].celdas[fila][columna] = { ...celda, numero, fijo: true };
    return { modelo: renumerar(nuevo), error: '' };
}

// ---------------------------------------------------------------------
// Resumen y validación (las mismas reglas que la base)
// ---------------------------------------------------------------------

/**
 * Capacidad = asientos a la venta (los bloqueados no cuentan).
 * porPiso: a la venta por piso; asientosPorPiso: todos los asientos (con bloqueados).
 */
export function resumir(modelo) {
    const porPiso = modelo.pisos.map(() => 0);
    const asientosPorPiso = modelo.pisos.map(() => 0);
    const porTipo = { normal: 0, vip: 0, cama: 0, bloqueado: 0 };

    recorrer(modelo, (celda, p) => {
        if (!esAsiento(celda)) return;
        asientosPorPiso[p]++;
        if (esVendible(celda)) porPiso[p]++;
        porTipo[celda.clase] = (porTipo[celda.clase] ?? 0) + 1;
    });

    return {
        porPiso,
        asientosPorPiso,
        porTipo,
        total: porPiso.reduce((a, b) => a + b, 0),
        bloqueados: porTipo.bloqueado
    };
}

/** Lista de problemas que impiden guardar (vacía si está bien). */
export function validarModelo(modelo) {
    const problemas = [];
    const { asientosPorPiso, total, bloqueados } = resumir(modelo);
    const vistos = new Map();

    modelo.pisos.forEach((piso, p) => {
        const nombrePiso = modelo.pisos.length > 1 ? `El piso ${p + 1}` : 'La plantilla';
        const filas = piso.celdas.length;
        const columnas = piso.celdas[0]?.length ?? 0;

        if (filas < 1 || filas > LIMITES.filas) problemas.push(`${nombrePiso} debe tener entre 1 y ${LIMITES.filas} filas.`);
        if (columnas < 1 || columnas > LIMITES.columnas) problemas.push(`${nombrePiso} debe tener entre 1 y ${LIMITES.columnas} columnas.`);
        if (asientosPorPiso[p] === 0) problemas.push(`${nombrePiso} debe tener al menos un asiento.`);
    });

    recorrer(modelo, celda => {
        if (!esAsiento(celda)) return;

        if (!Number.isInteger(celda.numero) || celda.numero < 1 || celda.numero > LIMITES.asientos) {
            problemas.push(`Hay un asiento con un número no válido (usa del 1 al ${LIMITES.asientos}).`);
        } else if (vistos.has(celda.numero)) {
            problemas.push(`El número de asiento ${celda.numero} está repetido.`);
        }

        vistos.set(celda.numero, true);
    });

    if (total === 0 && asientosPorPiso.some(n => n > 0)) {
        problemas.push('La plantilla debe tener al menos un asiento a la venta.');
    }

    if (total > LIMITES.asientos) {
        problemas.push(`Hay ${total} asientos a la venta: el máximo es ${LIMITES.asientos}.`);
    } else if (total + bloqueados > LIMITES.asientos) {
        problemas.push(`Entre asientos a la venta y bloqueados hay ${total + bloqueados}: los números van del 1 al ${LIMITES.asientos}, así que el máximo es ${LIMITES.asientos}.`);
    }

    if (modelo.pisos.length === 2 && total < LIMITES.minimoDosPisos) {
        problemas.push(`Un bus de dos pisos debe tener entre ${LIMITES.minimoDosPisos} y ${LIMITES.asientos} asientos a la venta (tiene ${total}).`);
    }

    return [...new Set(problemas)];
}

/** "1 asiento", "40 asientos". */
export function textoAsientos(cantidad) {
    return cantidad === 1 ? '1 asiento' : `${cantidad} asientos`;
}

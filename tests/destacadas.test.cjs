// Ejecutar: node --test tests/destacadas.test.cjs
// Frecuencias destacadas y banners de publicidad (cambio 5).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const cargar = () => import('../frontend/js/destacadas.js');

const HOY = '2026-11-21';
const coop = (extra = {}) => ({ id: 'c1', estado: 'activa', cupo_destacadas: 3, destacadas_hasta: null, ...extra });
const frec = (id, extra = {}) => ({ id, cooperativa_id: 'c1', activa: true, destacada: false, ...extra });

/* ---------- Fecha de Ecuador ---------- */

test('fechaHoyEcuador usa la zona America/Guayaquil (UTC-5)', async () => {
    const { fechaHoyEcuador } = await cargar();
    // 03:00 UTC del 22 = 22:00 del 21 en Ecuador.
    assert.equal(fechaHoyEcuador(new Date('2026-11-22T03:00:00Z')), '2026-11-21');
    assert.equal(fechaHoyEcuador(new Date('2026-11-22T05:00:00Z')), '2026-11-22');
});

test('diasDesdeBase cuenta desde 2026-01-01', async () => {
    const { diasDesdeBase } = await cargar();
    assert.equal(diasDesdeBase('2026-01-01'), 0);
    assert.equal(diasDesdeBase('2026-01-02'), 1);
    assert.equal(diasDesdeBase('2027-01-01'), 365);
    assert.equal(diasDesdeBase('2025-12-31'), -1);
});

/* ---------- Conteo del cupo ---------- */

test('contarUsadas cuenta solo las destacadas (y de la cooperativa pedida)', async () => {
    const { contarUsadas } = await cargar();
    const lista = [
        frec(1, { destacada: true }),
        frec(2),
        frec(3, { destacada: true }),
        frec(4, { destacada: true, cooperativa_id: 'c2' })
    ];
    assert.equal(contarUsadas(lista), 3);
    assert.equal(contarUsadas(lista, 'c1'), 2);
    assert.equal(contarUsadas(lista, 'c9'), 0);
    assert.equal(contarUsadas(null), 0);
});

test('estadoCupo arma el contador "Destacadas: 2 de 3" y los avisos', async () => {
    const { estadoCupo } = await cargar();

    const normal = estadoCupo(coop(), 2, HOY);
    assert.equal(normal.texto, 'Destacadas: 2 de 3');
    assert.equal(normal.libres, 1);
    assert.equal(normal.lleno, false);
    assert.equal(normal.aviso, '');

    assert.equal(estadoCupo(coop(), 3, HOY).lleno, true);
    assert.match(estadoCupo(coop(), 3, HOY).aviso, /cupo está lleno/);
    assert.equal(estadoCupo(coop({ cupo_destacadas: 0 }), 0, HOY).aviso,
        'Tu cupo es 0: solicita frecuencias destacadas al administrador.');
    assert.match(estadoCupo(coop({ destacadas_hasta: '2026-11-20' }), 1, HOY).aviso, /venció el 20\/11\/2026/);
    assert.match(estadoCupo(coop({ estado: 'suspendida' }), 0, HOY).aviso, /suspendida/);
    assert.match(estadoCupo(coop({ cupo_destacadas: 1 }), 3, HOY).aviso, /desmarca 2/);
});

/* ---------- Vigencia ---------- */

test('vigenciaVencida: vacía nunca vence y el último día todavía vale', async () => {
    const { vigenciaVencida } = await cargar();
    assert.equal(vigenciaVencida(null, HOY), false);
    assert.equal(vigenciaVencida('', HOY), false);
    assert.equal(vigenciaVencida('2026-11-21', HOY), false);
    assert.equal(vigenciaVencida('2026-12-31', HOY), false);
    assert.equal(vigenciaVencida('2026-11-20', HOY), true);
});

/* ---------- Se puede destacar o no ---------- */

test('el gerente marca una frecuencia activa con cupo libre y vigencia al día', async () => {
    const { puedeDestacar } = await cargar();
    const r = puedeDestacar({ rol: 'cooperativa', frecuencia: frec(1), cooperativa: coop(), usadas: 2, hoy: HOY });
    assert.deepEqual(r, { permitido: true, accion: 'marcar', motivo: '' });
});

test('no se puede marcar: cupo lleno, cupo 0, vencida, suspendida o inactiva', async () => {
    const { puedeDestacar } = await cargar();
    const base = { rol: 'cooperativa', frecuencia: frec(1), cooperativa: coop(), usadas: 0, hoy: HOY };
    const motivo = cambios => {
        const r = puedeDestacar({ ...base, ...cambios });
        assert.equal(r.permitido, false);
        return r.motivo;
    };

    assert.match(motivo({ usadas: 3 }), /Ya usas tus 3/);
    assert.equal(motivo({ cooperativa: coop({ cupo_destacadas: 0 }) }),
        'Tu cupo es 0: solicita frecuencias destacadas al administrador.');
    assert.match(motivo({ cooperativa: coop({ destacadas_hasta: '2026-11-01' }) }), /venció el 01\/11\/2026/);
    assert.match(motivo({ cooperativa: coop({ estado: 'suspendida' }) }), /suspendida/);
    assert.match(motivo({ frecuencia: frec(1, { activa: false }) }), /Activa la frecuencia/);
});

test('el oficinista ve la estrella pero no puede cambiarla', async () => {
    const { puedeDestacar } = await cargar();
    for (const destacada of [false, true]) {
        const r = puedeDestacar({ rol: 'oficinista', frecuencia: frec(1, { destacada }), cooperativa: coop(), usadas: 0, hoy: HOY });
        assert.equal(r.permitido, false);
        assert.match(r.motivo, /Solo el gerente/);
    }
});

test('el administrador solo desmarca', async () => {
    const { puedeDestacar } = await cargar();
    const marcar = puedeDestacar({ rol: 'administrador', frecuencia: frec(1), cooperativa: coop(), usadas: 0, hoy: HOY });
    assert.equal(marcar.permitido, false);
    assert.match(marcar.motivo, /solo puede quitar/);

    const desmarcar = puedeDestacar({ rol: 'administrador', frecuencia: frec(1, { destacada: true }), cooperativa: coop(), usadas: 1, hoy: HOY });
    assert.deepEqual(desmarcar, { permitido: true, accion: 'desmarcar', motivo: '' });
});

test('desmarcar siempre se puede para el gerente (aunque esté vencida, llena o suspendida)', async () => {
    const { puedeDestacar } = await cargar();
    const r = puedeDestacar({
        rol: 'cooperativa',
        frecuencia: frec(1, { destacada: true }),
        cooperativa: coop({ cupo_destacadas: 0, destacadas_hasta: '2026-01-01', estado: 'suspendida' }),
        usadas: 5,
        hoy: HOY
    });
    assert.equal(r.permitido, true);
    assert.equal(r.accion, 'desmarcar');
});

test('revisarCupo: entero de 0 a 999 y no menos que las ya marcadas', async () => {
    const { revisarCupo } = await cargar();
    assert.deepEqual(revisarCupo({ cupo: '3', hasta: '' }, 2), {});
    assert.deepEqual(revisarCupo({ cupo: '0', hasta: '2026-12-31' }, 0), {});
    assert.match(revisarCupo({ cupo: '' }).cupo, /Escribe el cupo/);
    assert.match(revisarCupo({ cupo: '-1' }).cupo, /entero/);
    assert.match(revisarCupo({ cupo: '1.5' }).cupo, /entero/);
    assert.match(revisarCupo({ cupo: '1' }, 3).cupo, /desmarcar 2 antes de bajar el cupo a 1/);
    assert.match(revisarCupo({ cupo: '1', hasta: '2026-13-40' }).hasta, /fecha válida/);
});

/* ---------- Banners ---------- */

test('bannerVigente: activo y hoy dentro de su rango (extremos incluidos)', async () => {
    const { bannerVigente } = await cargar();
    const b = { activo: true, fecha_inicio: '2026-11-21', fecha_fin: '2026-11-30' };
    assert.equal(bannerVigente(b, '2026-11-21'), true);
    assert.equal(bannerVigente(b, '2026-11-30'), true);
    assert.equal(bannerVigente(b, '2026-11-20'), false);
    assert.equal(bannerVigente(b, '2026-12-01'), false);
    assert.equal(bannerVigente({ ...b, activo: false }, '2026-11-25'), false);
});

test('estadoBanner: Publicado, Programado, Terminado o Inactivo', async () => {
    const { estadoBanner } = await cargar();
    const b = { activo: true, fecha_inicio: '2026-11-21', fecha_fin: '2026-11-30' };
    assert.equal(estadoBanner(b, '2026-11-25'), 'Publicado');
    assert.equal(estadoBanner(b, '2026-11-01'), 'Programado');
    assert.equal(estadoBanner(b, '2026-12-05'), 'Terminado');
    assert.equal(estadoBanner({ ...b, activo: false }, '2026-11-25'), 'Inactivo');
});

test('validarImagen: tipo JPG, PNG o WEBP y hasta 2 MB', async () => {
    const { validarImagen } = await cargar();
    assert.equal(validarImagen({ type: 'image/png', size: 1000 }), '');
    assert.equal(validarImagen({ type: 'image/webp', size: 2 * 1024 * 1024 }), '');
    assert.match(validarImagen({ type: 'image/gif', size: 1000 }), /JPG, PNG o WEBP/);
    assert.match(validarImagen({ type: 'image/jpeg', size: 2 * 1024 * 1024 + 1 }), /2 MB/);
    assert.match(validarImagen(null), /Elige la imagen/);
});

test('avisoMedidas recomienda 1200×400 sin bloquear', async () => {
    const { avisoMedidas } = await cargar();
    assert.equal(avisoMedidas(1200, 400), '');
    assert.equal(avisoMedidas(1500, 500), '');
    assert.match(avisoMedidas(800, 800), /1200×400/);
});

test('revisarBanner: obligatorios, https y fechas', async () => {
    const { revisarBanner } = await cargar();
    const ok = { titulo: 'Feriado', enlace: '', orden: '0', fechaInicio: '2026-11-21', fechaFin: '2026-11-30' };
    const img = { type: 'image/png', size: 1000 };

    assert.deepEqual(revisarBanner(ok, { hoy: HOY, nuevo: true, archivo: img }), {});
    assert.deepEqual(revisarBanner(ok, { hoy: HOY, nuevo: false, tieneImagen: true }), {});

    const e = revisarBanner({ titulo: '', enlace: 'http://x.com', orden: 'a', fechaInicio: '', fechaFin: '' }, { hoy: HOY, nuevo: true });
    assert.match(e.titulo, /título/);
    assert.match(e.imagen, /Elige la imagen/);
    assert.match(e.enlace, /https:\/\//);
    assert.match(e.orden, /entero/);
    assert.match(e.fechaInicio, /inicio/);
    assert.match(e.fechaFin, /fin/);

    assert.match(revisarBanner({ ...ok, fechaFin: '2026-11-20' }, { hoy: HOY, nuevo: false, tieneImagen: true }).fechaFin, /anterior a la de inicio/);
    assert.match(revisarBanner({ ...ok, fechaInicio: '2026-11-01', fechaFin: '2026-11-10' }, { hoy: HOY, nuevo: true, archivo: img }).fechaFin, /ya pasó/);
    assert.equal(revisarBanner({ ...ok, enlace: 'https://movipass.ec/promo' }, { hoy: HOY, nuevo: true, archivo: img }).enlace, undefined);
});

test('datosBanner limpia los valores para guardar', async () => {
    const { datosBanner } = await cargar();
    assert.deepEqual(
        datosBanner({ titulo: '  Promo ', enlace: ' ', cooperativaId: '', orden: '', activo: 'true', fechaInicio: '2026-11-21', fechaFin: '2026-11-30' }),
        { titulo: 'Promo', enlace: null, cooperativa_id: null, orden: 0, activo: true, fecha_inicio: '2026-11-21', fecha_fin: '2026-11-30' }
    );
});

test('rutaDesdeUrl y rutaImagen', async () => {
    const { rutaDesdeUrl, rutaImagen } = await cargar();
    assert.equal(rutaDesdeUrl('https://abc.supabase.co/storage/v1/object/public/publicidad/x1.png'), 'x1.png');
    assert.equal(rutaDesdeUrl('https://otro.com/x.png'), '');
    assert.equal(rutaImagen('x1', 'image/webp'), 'x1.webp');
    assert.equal(rutaImagen('x1', 'image/jpeg'), 'x1.jpg');
});

test('moverBanner reordena 0..n-1 y no sale de los extremos', async () => {
    const { moverBanner } = await cargar();
    const lista = [{ id: 'a', orden: 0 }, { id: 'b', orden: 1 }, { id: 'c', orden: 2 }];
    assert.deepEqual(moverBanner(lista, 'c', -1), [{ id: 'c', orden: 1 }, { id: 'b', orden: 2 }]);
    assert.equal(moverBanner(lista, 'a', -1), null);
    assert.equal(moverBanner(lista, 'c', 1), null);
});

/* ---------- Orden rotativo diario ---------- */

test('ordenRotativo: el día 0 sale primero el id menor y cada día se desplaza uno', async () => {
    const { ordenRotativo } = await cargar();
    const lista = [{ id: 30 }, { id: 10 }, { id: 20 }];
    const ids = hoy => ordenRotativo(lista, hoy).map(e => e.id);

    assert.deepEqual(ids('2026-01-01'), [10, 20, 30]);
    assert.deepEqual(ids('2026-01-02'), [20, 30, 10]);
    assert.deepEqual(ids('2026-01-03'), [30, 10, 20]);
    assert.deepEqual(ids('2026-01-04'), [10, 20, 30]);
    assert.deepEqual(ids('2025-12-31'), [30, 10, 20]);
});

test('ordenRotativo: en n días seguidos cada una sale primera exactamente una vez', async () => {
    const { ordenRotativo } = await cargar();
    const lista = [1, 2, 3, 4, 5, 6, 7].map(id => ({ id }));
    const primeras = [];
    for (let d = 0; d < lista.length; d++) {
        const fecha = new Date(Date.UTC(2026, 10, 21 + d)).toISOString().slice(0, 10);
        primeras.push(ordenRotativo(lista, fecha)[0].id);
    }
    assert.deepEqual([...primeras].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
});

test('ordenRotativo: mismo día, mismo orden; lista vacía; no cambia la original', async () => {
    const { ordenRotativo } = await cargar();
    const lista = [{ id: 2 }, { id: 1 }];
    assert.deepEqual(ordenRotativo(lista, HOY), ordenRotativo(lista, HOY));
    assert.deepEqual(ordenRotativo([], HOY), []);
    assert.deepEqual(lista.map(e => e.id), [2, 1]);
});

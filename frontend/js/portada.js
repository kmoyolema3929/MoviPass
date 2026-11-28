// frontend/js/portada.js
// Portada pública (cambio 5): carrusel de banners y "Viajes destacados".
// Se ve sin iniciar sesión: usa banners_inicio() y destacadas_inicio(), que
// devuelven solo campos seguros. Si no hay datos (o falla), la sección no se muestra.

import { supabase } from './supabaseClient.js';
import { fechaHoyEcuador } from './destacadas.js';

const $ = id => document.getElementById(id);

function el(etiqueta, clase = '', texto) {
    const e = document.createElement(etiqueta);
    if (clase) e.className = clase;
    if (texto !== undefined) e.textContent = texto;
    return e;
}

/** Solo se aceptan enlaces https (la base también lo exige). */
const enlaceSeguro = url => /^https:\/\/\S+$/.test(String(url ?? ''));

/* ---------- Banners ---------- */

async function mostrarBanners() {
    const { data, error } = await supabase.rpc('banners_inicio');
    if (error) throw error;

    const banners = data ?? [];
    if (banners.length === 0) return;

    const items = $('itemsBanners');
    const indicadores = $('indicadoresBanners');

    banners.forEach((b, i) => {
        const item = el('div', `carousel-item${i === 0 ? ' active' : ''}`);
        const img = el('img', 'd-block');
        img.src = b.imagen_url;
        img.alt = b.titulo;
        if (i > 0) img.loading = 'lazy';

        if (enlaceSeguro(b.enlace)) {
            const a = el('a');
            a.href = b.enlace;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.setAttribute('aria-label', `${b.titulo} (se abre en otra pestaña)`);
            a.appendChild(img);
            item.appendChild(a);
        } else {
            item.appendChild(img);
        }
        items.appendChild(item);

        const punto = el('button');
        punto.type = 'button';
        punto.dataset.bsTarget = '#carruselBanners';
        punto.dataset.bsSlideTo = String(i);
        punto.setAttribute('aria-label', `Banner ${i + 1}: ${b.titulo}`);
        if (i === 0) {
            punto.className = 'active';
            punto.setAttribute('aria-current', 'true');
        }
        indicadores.appendChild(punto);
    });

    // Con un solo banner no hacen falta flechas ni puntos.
    const varios = banners.length > 1;
    document.querySelectorAll('#carruselBanners .carousel-control-prev, #carruselBanners .carousel-control-next')
        .forEach(control => { control.hidden = !varios; });
    indicadores.hidden = !varios;

    $('seccionBanners').hidden = false;
    if (varios && window.bootstrap) {
        bootstrap.Carousel.getOrCreateInstance($('carruselBanners'), { interval: 6000, ride: 'carousel' }).cycle();
    }
}

/* ---------- Viajes destacados ---------- */

const RUTA_ASIENTOS = new URL('../pages/seleccion-asientos.html', import.meta.url);

function fechaTexto(fechaISO) {
    const [y, m, d] = String(fechaISO).split('-');
    return `${d}/${m}/${y}`;
}

function iniciales(nombre) {
    return String(nombre ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '★';
}

function tarjeta(v, hoy) {
    const columna = el('div', 'col-12 col-md-6 col-xl-4');
    const card = el('article', 'card h-100 shadow-sm border-0');
    const cuerpo = el('div', 'card-body d-flex flex-column');

    // Encabezado: logo (llega en el cambio 1; por ahora las iniciales) y nombre.
    const cabecera = el('div', 'd-flex align-items-center gap-2 mb-2');
    const logo = el('span', 'logo-cooperativa', iniciales(v.cooperativa));
    logo.setAttribute('aria-hidden', 'true');
    cabecera.append(logo, el('h3', 'h6 mb-0 text-break', v.cooperativa));
    cuerpo.appendChild(cabecera);

    cuerpo.appendChild(el('p', 'h5 card-title mb-1', `${v.origen} → ${v.destino}`));
    const cuando = v.fecha === hoy ? 'Hoy' : `Mañana ${fechaTexto(v.fecha)}`;
    cuerpo.appendChild(el('p', 'text-muted mb-2', `${cuando} · ${String(v.hora).slice(0, 5)}`));
    cuerpo.appendChild(el('p', 'fs-5 fw-bold text-primary mb-3', `Desde $${Number(v.precio_base).toFixed(2)}`));

    const enlace = el('a', 'btn btn-primary mt-auto', 'Ver asientos');
    const url = new URL(RUTA_ASIENTOS);
    url.searchParams.set('viaje_id', v.viaje_id);
    enlace.href = url.href;
    enlace.setAttribute('aria-label', `Ver asientos: ${v.cooperativa}, ${v.origen} a ${v.destino}, ${String(v.hora).slice(0, 5)}`);
    cuerpo.appendChild(enlace);

    card.appendChild(cuerpo);
    columna.appendChild(card);
    return columna;
}

async function mostrarDestacadas() {
    const { data, error } = await supabase.rpc('destacadas_inicio');
    if (error) throw error;

    const viajes = data ?? [];
    if (viajes.length === 0) return;

    // El orden (rotativo por día) ya viene de la base.
    const hoy = fechaHoyEcuador();
    $('tarjetasDestacadas').replaceChildren(...viajes.map(v => tarjeta(v, hoy)));
    $('seccionDestacadas').hidden = false;
}

// Si algo falla la portada sigue igual, solo sin esas secciones.
mostrarBanners().catch(error => console.warn('No se pudieron cargar los banners:', error));
mostrarDestacadas().catch(error => console.warn('No se pudieron cargar los viajes destacados:', error));

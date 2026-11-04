import { obtenerSesion, obtenerRol, cerrarSesion } from './auth.js';

const zonaSesion = document.getElementById('navSesion');
const ctaHero = document.getElementById('ctaHero');

function crearBoton(texto, clase, href) {
    const el = document.createElement(href ? 'a' : 'button');
    el.className = clase;
    el.textContent = texto; // textContent evita inyección de HTML
    if (href) el.href = href;
    else el.type = 'button';
    return el;
}

function pintarSesionActiva(user, rol) {
    // Nombre guardado al registrarse (options.data.nombres)
    const nombre = (user.user_metadata?.nombres || user.email || '').split(' ')[0];

    const saludo = document.createElement('span');
    saludo.className = 'navbar-text text-white me-2';
    saludo.textContent = `Hola, ${nombre}`;

    // El panel depende del rol: administrador/, cooperativa/, oficinista/, cliente/ o bus/
    const panel = rol ? `${rol}/index.html` : null;

    const btnSalir = crearBoton('Cerrar sesión', 'btn btn-outline-light');
    btnSalir.addEventListener('click', () => cerrarSesion('index.html'));

    zonaSesion.replaceChildren(saludo);
    if (panel) zonaSesion.append(crearBoton('Mi panel', 'btn btn-light text-primary fw-bold', panel));
    zonaSesion.append(btnSalir);

    // En el hero ya no tiene sentido "Crear cuenta / Iniciar sesión"
    if (ctaHero && panel) {
        ctaHero.replaceChildren(
            crearBoton('Ir a mi panel', 'btn btn-warning btn-lg px-5 fw-bold text-dark', panel)
        );
    }
}

async function iniciar() {
    if (!zonaSesion) return;

    try {
        const sesion = await obtenerSesion();
        if (!sesion?.user) return; // sin sesión: se deja el menú por defecto

        let rol = null;
        try {
            rol = await obtenerRol();
        } catch (err) {
            console.error('No se pudo obtener el rol:', err);
        }
        pintarSesionActiva(sesion.user, rol);
    } catch (err) {
        // Si algo falla, se mantiene "Iniciar sesión / Registrarse"
        console.error('No se pudo comprobar la sesión:', err);
    }
}

iniciar();
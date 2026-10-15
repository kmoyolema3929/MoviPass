# MoviPass

Aplicación web para la gestión y venta de pasajes de transporte interprovincial en Ecuador.

> Proyecto del segundo parcial de **Manejo y Configuración de Software**, Carrera de Software, Facultad de Ingeniería en Sistemas, Electrónica e Industrial (FISEI), Universidad Técnica de Ambato.

## Descripción
MoviPass permite a las cooperativas de transporte administrar sus buses, frecuencias y hojas de ruta, y a los usuarios buscar viajes, elegir asientos, pagar y obtener un boleto con código QR.

## Roles del sistema
| Rol | Función |
|---|---|
| Administrador | Crea cooperativas y su usuario gerente |
| Cooperativa | Gestiona buses, frecuencias, rutas y precios |
| Oficinista | Vende boletos y aprueba comprobantes de pago |
| Usuario final | Busca viajes, compra y consulta su historial |
| Usuario bus | Valida boletos y cobra en ruta |

## Tecnologías
| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS3, JavaScript, Bootstrap 5 |
| Backend como servicio | Supabase (PostgreSQL, Auth, Storage) |
| Acceso a datos | supabase-js |
| Migraciones | Supabase CLI |
| Autenticación | Supabase Auth |
| Archivos subidos (comprobantes y fotos de buses) | Supabase Storage |
| Código QR | Librería JS qrcode |
| Notificaciones | Tabla de notificaciones en la app y correos de Supabase |
| Tareas programadas | pg_cron (Supabase) |
| Publicación del frontend | Netlify |

Las decisiones técnicas están registradas en [docs/DECISIONES.md](docs/DECISIONES.md).

## Requisitos previos
- Git
- Node.js (solo para ejecutar la Supabase CLI con `npx`)
- VS Code con la extensión Live Server
- Acceso al proyecto de Supabase del equipo

## Instalación y ejecución
```bash
git clone https://github.com/kmoyolema3929/MoviPass.git
cd MoviPass
git checkout develop

# Configuración del frontend
cp frontend/js/config.example.js frontend/js/config.js   # completa SUPABASE_URL y SUPABASE_ANON_KEY

# Solo para quien aplica migraciones a Supabase
cp .env.example .env     # completa los valores en .env
```
Las claves del proyecto las entrega el equipo por un canal privado. **Nunca se suben al repositorio.**

Para ejecutar la aplicación, abre la carpeta `frontend/` en VS Code, haz clic derecho sobre una página de `frontend/pages/` y elige **Open with Live Server**. Se abrirá en `http://127.0.0.1:5500`.

La guía completa, con solución de problemas, está en [docs/GUIA_INSTALACION.md](docs/GUIA_INSTALACION.md).

## Aplicación publicada
Dirección en Netlify: https://movipass.netlify.app

## Estructura del repositorio
```
frontend/   Pantallas (HTML, CSS, JavaScript, Bootstrap)
supabase/   Migraciones y datos de prueba (SQL)
scripts/    Scripts de despliegue
docs/       Documentación y capturas
.github/    Plantillas de issues y pull requests
```

## Flujo de trabajo
Usamos **Gitflow** y control de cambios formal. Ver [CONTRIBUTING.md](CONTRIBUTING.md), [docs/FLUJO_GIT.md](docs/FLUJO_GIT.md) y [docs/CONTROL_DE_CAMBIOS.md](docs/CONTROL_DE_CAMBIOS.md).

## Equipo
| Integrante | Rol de gestión |
|---|---|
| Katherine Moyolema | Líder - Desarrollo - Comité de cambios |
| Anahi Molina | Desarrollo - Comité de cambios |
| Alisson Paredes | Documentación - Desarrollo |
| Alina Ortiz | Documentación - Desarrollo |
| Mateo Herrera | Documentación - Desarrollo |
| Julio Zurita | Documentación - Desarrollo |

## Soporte
Ver [SUPPORT.md](SUPPORT.md).

## Licencia
GPL v3. Ver [LICENSE](LICENSE).

## Cómo citar
Ver [CITATION.cff](CITATION.cff).
# Política de seguridad

## Versiones con soporte
| Versión | Soporte |
|---|---|
| `main` (última versión) | Sí |
| Versiones anteriores | No |

## Cómo reportar una vulnerabilidad
**No abras un issue público.** Informa a la líder del proyecto, Katherine Moyolema, por una de estas vías:

- Correo: `kmoyolema3929@gmail.com`
- La opción **Report a vulnerability** de la pestaña *Security* de este repositorio

Incluye:
- Descripción del problema.
- Pasos para reproducirlo.
- Impacto posible.

Responderemos en un máximo de **72 horas**. Si la vulnerabilidad es crítica, se tratará como cambio de emergencia según [docs/CONTROL_DE_CAMBIOS.md](docs/CONTROL_DE_CAMBIOS.md).

## Buenas prácticas del proyecto

### Claves y archivos sensibles
- **Nunca** subir contraseñas, tokens o claves al repositorio.
- La clave **`service_role`** de Supabase da acceso total a la base de datos y **jamás** se usa en el frontend ni se sube a Git.
- Las variables de la CLI van en `.env` y la configuración del frontend en `frontend/js/config.js`. Ambos archivos están ignorados por Git. Se incluyen `.env.example` y `frontend/js/config.example.js` sin valores reales.
- En el frontend solo se usan la URL del proyecto y la clave `anon`. Estas son públicas por diseño, así que **la seguridad real depende de las políticas RLS**, no de ocultar la clave.
- Las claves se comparten entre el equipo por un canal privado, nunca por el repositorio, issues ni capturas de pantalla.
- En Netlify, `SUPABASE_URL` y `SUPABASE_ANON_KEY` se configuran como variables de entorno del sitio. El script `scripts/generar-config.sh` crea `config.js` durante el despliegue, así las claves no pasan por el repositorio.
- Las vistas previas de Netlify pueden ser accesibles por cualquiera que tenga el enlace: no se usan datos reales en ellas.

### Base de datos
- Todas las tablas se crean con **RLS (Row Level Security) activado** y con políticas explícitas por rol.
- Ningún cambio de base de datos se hace desde el panel web de Supabase: todo va en archivos de migración dentro de `supabase/migrations/`, revisados en un Pull Request.
- Las contraseñas de los usuarios las gestiona Supabase Auth (con hash). Nunca se guardan en tablas propias ni en texto plano.
- Las reglas de negocio sensibles (venta de asientos, descuentos, validación de boletos) se ejecutan en funciones de la base de datos y no en el navegador, para que el usuario no pueda alterarlas.

### Datos personales
- Los comprobantes de pago y las cédulas son datos personales: acceso solo para roles autorizados.
- Los buckets de Supabase Storage con comprobantes y documentos son **privados**, con políticas por rol. Solo las fotos públicas de los buses pueden estar en un bucket público.
- Los datos de prueba no deben contener cédulas, comprobantes ni correos reales.

### Código
- Validar y sanear toda entrada de usuario, tanto en el formulario como en la base de datos (restricciones y tipos).
- No insertar texto del usuario directamente en el HTML con `innerHTML`; usar `textContent` para evitar inyección de scripts (XSS).
- Mantener actualizadas las dependencias y fijar la versión de las librerías cargadas por CDN.

## Si se filtra una clave
1. Avisar de inmediato a la líder del proyecto.
2. Regenerar la clave afectada desde el panel de Supabase (Project Settings → API).
3. Entregar la nueva clave al equipo por el canal privado.
4. Registrar el incidente como cambio de emergencia en [docs/CONTROL_DE_CAMBIOS.md](docs/CONTROL_DE_CAMBIOS.md).

Borrar el archivo en un commit nuevo **no basta**: la clave queda en el historial de Git y debe considerarse comprometida.
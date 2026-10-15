# Registro de decisiones técnicas

Aquí se documentan las decisiones importantes del proyecto, con su motivo y las alternativas que se descartaron. Las decisiones no se borran ni se reescriben: cuando una se reemplaza, se cambia su estado y se agrega una nueva.

## D-001: Backend con Spring Boot

- **Fecha:** 12 de octubre de 2026
- **Estado:** Reemplazada por D-002 (14 de octubre de 2026)
- **Decidida por:** equipo de desarrollo

### Contexto
El proyecto necesita roles de usuario (administrador, cooperativa, oficinista, cliente y bus), venta de asientos sin duplicados, validaciones de datos, subida de comprobantes, correos y tareas programadas (eliminar reservas sin comprobante a las 3 horas).

### Decisión
Usar Java 21 con Spring Boot 4 y Maven para el backend. PostgreSQL como base de datos, con migraciones versionadas en Flyway. El frontend se mantiene en HTML, CSS, JavaScript y Bootstrap 5.

### Motivos
- Spring Security resuelve la autorización por rol de forma integrada.
- Las transacciones de JPA ayudan a evitar que dos personas compren el mismo asiento.
- Flyway versiona los cambios de la base de datos, lo que encaja con el control de versiones del proyecto.
- Correos, archivos subidos y tareas programadas vienen incluidos en el framework.
- La estructura por capas (controller, service, repository) mantiene el código consistente entre los 6 integrantes.

### Alternativas descartadas
- **Node.js con Express:** válida, pero obliga a construir manualmente la seguridad por roles, las validaciones y las migraciones.

### Consecuencias
- Se actualizaron README, `.env.example`, `.gitignore` y `CHANGELOG.md`.
- Los archivos de migración usan el formato `V001__nombre.sql`.

## D-002: Supabase como backend

- **Fecha:** 14 de octubre de 2026
- **Estado:** Aprobada
- **Decidida por:** equipo de desarrollo
- **Reemplaza a:** D-001

### Contexto
El proyecto necesita roles de usuario, subida de comprobantes y fotos, base de datos relacional, notificaciones y tareas programadas, con un plazo corto y con la gestión de versiones y de cambios como foco de la materia.

### Decisión
Usar Supabase (PostgreSQL, Auth y Storage) como backend, con un frontend en HTML, CSS, JavaScript y Bootstrap 5. Los cambios de base de datos se hacen solo mediante archivos de migración versionados en `supabase/migrations/`.

### Motivos
- Autenticación, almacenamiento de archivos y API de datos vienen incluidos.
- Las políticas de seguridad por fila (RLS) permiten controlar el acceso por rol.
- Las migraciones en el repositorio permiten versionar la base de datos con Git.
- No hay que programar ni mantener un servidor propio.

### Alternativas descartadas
- **Node.js con Express:** obliga a construir manualmente la seguridad por roles, las validaciones y las migraciones.
- **Java con Spring Boot (D-001):** válida técnicamente, pero obliga a programar, configurar y mantener un servidor propio.

### Consecuencias
- Ningún cambio de esquema se hace desde el panel web de Supabase.
- La clave `service_role` nunca se sube al repositorio.
- Las carpetas `backend/` y `database/` se reemplazan por `supabase/`.
- Se actualizan README, `.env.example`, `.gitignore`, `SECURITY.md` y `CHANGELOG.md`.

## D-003: Netlify para publicar el frontend

- **Fecha:** 14 de octubre de 2026
- **Estado:** Aprobada
- **Decidida por:** equipo de desarrollo

### Contexto
Con Supabase como backend, el frontend es un sitio estático (HTML, CSS y JavaScript) que se puede publicar sin servidor propio.

### Decisión
Publicar la carpeta `frontend/` en Netlify, con despliegue automático desde GitHub. Como `frontend/js/config.js` no se sube al repositorio, el despliegue lo genera con `scripts/generar-config.sh`, a partir de las variables de entorno `SUPABASE_URL` y `SUPABASE_ANON_KEY` configuradas en Netlify.

### Motivos
- Publica la aplicación en una dirección web sin mantener un servidor.
- El despliegue se hace solo al fusionar cambios en la rama de producción.
- Genera una vista previa por cada Pull Request, útil como evidencia en la revisión.
- Las claves se mantienen fuera del repositorio.

### Alternativas descartadas
- **Ejecutar solo en local con Live Server:** no permite mostrar ni probar la aplicación publicada.

### Consecuencias
- Se agrega `netlify.toml` y `scripts/generar-config.sh`.
- Las variables `SUPABASE_URL` y `SUPABASE_ANON_KEY` se cargan en el panel de Netlify, nunca en el repositorio.

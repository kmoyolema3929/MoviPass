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

## D-004: Issues de GitHub para la gestión de cambios

- **Fecha:** 14 de octubre de 2026
- **Estado:** Aprobada
- **Decidida por:** equipo de desarrollo

### Contexto
El profesor permite elegir entre Jira o los issues de GitHub para registrar tareas, errores y solicitudes de cambio. El equipo ya trabaja con issues (por ejemplo, los de la base técnica del Sprint 0) y con la rama `develop`.

### Decisión
Usar los issues de GitHub como única herramienta de seguimiento. Hay tres plantillas: nueva funcionalidad (`feature`), reporte de error (`bug`) y solicitud de cambio (`cambio`). Cada Pull Request se vincula a su issue con `Closes #n`, y el comité de control de cambios decide sobre las solicitudes de cambio en el propio issue.

### Motivos
- Los issues viven en el mismo lugar que el código, las ramas y los Pull Requests, y se cierran solos al fusionar.
- No hay que mantener una herramienta externa ni duplicar tickets.
- El historial de decisiones queda en el repositorio, como evidencia del control de cambios.

### Alternativas descartadas
- **Jira (tickets `CAM-n`):** permitida por el profesor, pero agrega una herramienta más y obliga a enlazar cada ticket con GitHub a mano.

### Consecuencias
- Se quitan las referencias a Jira de las plantillas de issues y de Pull Requests, de `CONTRIBUTING.md` y de `docs/CONTROL_DE_CAMBIOS.md`.
- Se elimina la carpeta `docs/capturas/jira/`.
- Los nombres de rama ya no llevan el código `CAM-n`.

## D-005: Rama predeterminada y aprobación por comité

- **Fecha:** 14 de octubre de 2026
- **Estado:** Aprobada
- **Decidida por:** equipo de desarrollo, con la indicación del profesor

### Contexto
Los issues no se cerraban solos porque los Pull Requests se fusionan en `develop` y GitHub solo cierra issues al fusionar en la rama predeterminada. Además, el profesor pidió que los cambios los apruebe un número reducido de personas.

### Decisión
- `develop` pasa a ser la rama predeterminada. `main` queda solo para versiones estables y se protege sin excepciones.
- Los Pull Requests hacia `develop` y `main` los aprueba el comité de control de cambios (Katherine Moyolema y Anahi Molina). Basta una aprobación, con revisión de code owners, y las aprobaciones se descartan si se suben commits nuevos.
- Se elimina la revisión rotativa.
- La líder puede subir directamente a `develop`, sin rama ni Pull Request, los cambios de la documentación inicial. Todo lo demás pasa por Pull Request.

### Motivos
- Los issues se cierran automáticamente al fusionar, sin tocar `main`.
- Un comité de dos personas simplifica la revisión y evita que alguien quede sin quien lo apruebe.
- La excepción de la documentación inicial evita ramas y Pull Requests para cambios menores, como indicó el profesor.

### Alternativas descartadas
- **Mantener `main` como rama predeterminada:** obligaba a fusionar a `main` para cerrar issues.
- **Revisión rotativa entre los seis integrantes:** más difícil de seguir y de verificar.

### Consecuencias
- Se actualizan `README.md`, `CONTRIBUTING.md`, `docs/FLUJO_GIT.md`, `docs/CONTROL_DE_CAMBIOS.md`, `CODEOWNERS` y `CHANGELOG.md`.
- Se eliminan las ramas `feature/ajuste-revision-prs`, `feature/cambio-stack-spring-boot` y `feature/cambio-stack-supabase`, ya fusionadas en `develop`.
- Se documentó la excepción de la líder en `CONTRIBUTING.md` y `docs/FLUJO_GIT.md`.
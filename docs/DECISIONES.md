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
- **Estado:** Reemplazada por D-008 (15 de octubre de 2026)
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

## D-006: Organización de issues y Pull Requests para la auditoría

- **Fecha:** 15 de octubre de 2026
- **Estado:** Aprobada
- **Decidida por:** equipo de desarrollo, con la indicación del profesor

### Contexto
El profesor pidió generar reportes que verifiquen el trabajo realizado conforme a las peticiones de cambio, para simular una auditoría de gestión de la configuración. Con issues de GitHub como herramienta única (D-004), los reportes solo son fiables si todos los issues y Pull Requests se registran con el mismo formato.

### Decisión
- Todo issue y todo Pull Request lleva **una etiqueta de tipo** (`feature`, `docs`, `chore`, `bug` o `cambio`), **una de prioridad** (`prioridad: baja`, `media`, `alta` o `crítica`) y **una de módulo** (`módulo: base`, `autenticación`, `cooperativas y buses`, `frecuencias y rutas`, `búsqueda y asientos`, `compra y pago`, `oficinista y configuración` o `documentación`), además de milestone y responsable.
- Los títulos de los issues siguen la fórmula `[TIPO] Módulo: verbo en infinitivo y qué se hace`, y el tipo y el módulo coinciden con las etiquetas. Los títulos de los Pull Requests usan `tipo: descripción`.
- Cada Pull Request lleva `Closes #n` en su descripción y las mismas etiquetas, milestone y responsable que su issue. Esto se hace **a mano**.
- Los issues se cierran como *Completed* con un comentario que apunta al Pull Request, o como *Not planned* con el motivo.
- Se eliminan las etiquetas que el proyecto no usa (`accessibility`, `good first issue`, `help wanted` y `question`) y las descripciones de las demás pasan a español.

### Motivos
- Los reportes por tipo, módulo, prioridad y responsable solo funcionan si todos los registros tienen los mismos datos.
- Un título que no coincide con su etiqueta es una inconsistencia que una auditoría marcaría.
- El vínculo entre issue y Pull Request da la trazabilidad pedida: solicitud, cambio y verificación.

### Alternativas descartadas
- **Automatizar con GitHub Actions** (copiar etiquetas y verificar `Closes #n`): útil, pero agrega un archivo más que mantener. Con seis integrantes y pocos Pull Requests, el equipo prefirió hacerlo a mano, con una casilla en la plantilla de Pull Request. Puede reconsiderarse si el trabajo crece.
- **Un milestone aparte para la documentación:** el milestone indica cuándo se hace el trabajo y la etiqueta indica qué es, así que la documentación va en el mismo milestone que lo demás.

### Consecuencias
- Se reescribe `docs/CONTROL_DE_CAMBIOS.md` con la sección de títulos y etiquetas, y se actualiza la plantilla de Pull Request.
- Se reescriben los issues del Sprint 0 (#1 a #13) para el nuevo stack, con títulos y etiquetas normalizados.
- Se reparten los issues del Sprint 0 entre los seis integrantes.
- Los Pull Requests ya fusionados (#2, #4 y #14) reciben las mismas etiquetas que sus issues.

## D-007: Conventional Commits con ámbito

- **Fecha:** 15 de octubre de 2026
- **Estado:** Aprobada
- **Decidida por:** equipo de desarrollo, con la indicación del profesor

### Contexto
El profesor pidió que los commits sigan Conventional Commits, con tipo, ámbito y descripción corta, para que el historial sirva en la auditoría de gestión de la configuración.

### Decisión
Todos los commits y los títulos de los Pull Requests usan el formato `tipo(ámbito): descripción`, con los tipos `feat`, `fix`, `docs`, `refactor`, `test` y `chore`. El ámbito es el módulo o el documento que cambia. El `Closes #n` va en el pie del commit.

### Motivos
- El historial se lee igual que las etiquetas de los issues (tipo y módulo).
- Cada cambio se puede ubicar por módulo sin abrir el commit.

### Alternativas descartadas
- **Formato sin ámbito (`tipo: descripción`):** no permite filtrar el historial por módulo.
- **Validación automática con `commitlint`:** más herramientas que mantener; el equipo prefirió comprobarlo en la plantilla de Pull Request.

### Consecuencias
- Se actualizan `CONTRIBUTING.md` y la plantilla de Pull Request.
- Los commits anteriores no se reescriben.

## D-008: Configuración de Netlify para cuidar los créditos

- **Fecha:** 15 de octubre de 2026
- **Estado:** Aprobada
- **Decidida por:** equipo de desarrollo
- **Reemplaza a:** D-003

### Contexto
El plan gratuito de Netlify asigna una cantidad limitada de créditos mensuales. La configuración inicial de D-003 generaba un despliegue por cada Pull Request (Deploy Preview) y por cada rama, lo que consumía créditos con el trabajo diario en `develop`. Como el equipo trabaja sobre `develop` y solo publica versiones estables en `main` (D-005), no tiene sentido desplegar cada cambio intermedio.

### Decisión
Mantener el sitio de Netlify conectado al repositorio, con la rama `main` como única rama de producción, y restringir los despliegues automáticos:
- **Branch deploys:** solo la rama de producción (`main`).
- **Deploy Previews:** desactivados (`Don't deploy pull requests`).

Las variables `SUPABASE_URL` y `SUPABASE_ANON_KEY` quedan cargadas en el panel de Netlify, con la opción "Contains secret values" activada para la clave anónima.

### Motivos
- Solo se publica cuando se fusiona algo estable en `main`, que es el flujo definido en D-005.
- Se evita gastar créditos en despliegues de ramas de trabajo que no se revisan visualmente.
- Las variables de entorno siguen fuera del repositorio, como exige D-002.

### Alternativas descartadas
- **Mantener Deploy Previews activos (D-003):** permitía revisar visualmente cada Pull Request, pero consumía créditos de forma innecesaria para un equipo que revisa el código directamente en GitHub.
- **Dejar Branch deploys activos:** generaba un sitio por rama, sin uso real dentro del flujo del equipo.

### Consecuencias
- El sitio publicado es `https://movipass.netlify.app` y se actualiza solo al fusionar en `main`.
- La dirección del sitio queda registrada en el `README.md` (Issue #5).
- Si en el futuro se necesita revisar visualmente un Pull Request, se puede volver a activar Deploy Previews de forma puntual.

## D-009: Opciones de seguridad de Supabase

- **Fecha:** 15 de octubre de 2026
- **Estado:** Aprobada
- **Decidida por:** Katherine Moyolema (responsable del Issue #5)

### Decisión
Al crear el proyecto de Supabase se eligieron las siguientes opciones de seguridad:
- **Data API:** habilitada (necesaria para que el frontend consulte la base).
- **Exposición automática de tablas:** deshabilitada (las tablas se exponen solo cuando la migración lo indica explícitamente, para evitar filtraciones por descuido).
- **RLS automático:** habilitado (toda tabla nueva nace con Row Level Security activado).

### Motivos
- La Data API es la vía por la que el frontend habla con Supabase.
- Desactivar la exposición automática obliga a decidir conscientemente qué se publica.
- Activar RLS automático evita que una tabla quede sin protección por olvido, como exige D-002 y el Issue #10.

### Consecuencias
- Toda migración que cree una tabla debe declarar explícitamente su exposición y sus políticas RLS.
- Documentado en `docs/MODELO_DATOS.md` (#10).
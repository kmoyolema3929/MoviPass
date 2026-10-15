# Registro de cambios

Todos los cambios importantes de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]
### Agregado
- Estructura inicial del repositorio y carpetas del proyecto.
- Documentación base: README, CONTRIBUTING, SECURITY, SUPPORT y CODE_OF_CONDUCT.
- Licencia GPL v3 y archivo de citación (CITATION.cff).
- Plantillas de issues y pull requests, y archivo CODEOWNERS.
- Documentos del flujo de Git y del control de cambios.
- Registro de decisiones técnicas (`docs/DECISIONES.md`).
- Carpeta `supabase/migrations/` para versionar los cambios de la base de datos.
- Configuración de Netlify (`netlify.toml` y `scripts/generar-config.sh`) para publicar el frontend.
- Archivo `frontend/js/config.example.js` con la configuración de Supabase para el frontend.
- Excepción de la líder: puede subir directamente a `develop` los cambios de la documentación inicial, sin rama ni Pull Request (decisión D-005).
- Decisiones D-004 (issues de GitHub para la gestión de cambios), D-005 (rama predeterminada y aprobación por comité) y D-006 (organización de issues y Pull Requests para la auditoría) en `docs/DECISIONES.md`.
- Etiquetas de prioridad (`prioridad: baja`, `media`, `alta` y `crítica`) y de módulo (`módulo: base`, `autenticación`, `cooperativas y buses`, `frecuencias y rutas`, `búsqueda y asientos`, `compra y pago`, `oficinista y configuración` y `documentación`) para los reportes de auditoría (decisión D-006).
- Sección de títulos y etiquetas en `docs/CONTROL_DE_CAMBIOS.md`, con la fórmula `[TIPO] Módulo: verbo y qué se hace` (decisión D-006).

### Cambiado
- El backend pasa de Node.js/Express a Java con Spring Boot (Maven, Flyway y Spring Security) (PR #2, decisión D-001).
- El backend pasa de Java con Spring Boot a Supabase (PostgreSQL, Auth y Storage) (PR #14, decisión D-002).
- Se ajusta el proceso de revisión de Pull Requests: el autor fusiona tras la aprobación, se exige comentar la revisión y las ramas se conservan tras fusionar (PR #4).
- Se actualizan el README, `.env.example`, `.gitignore` y `SECURITY.md` con cada cambio de stack.
- La rama predeterminada del repositorio pasa a ser `develop`, para que los issues se cierren al fusionar los Pull Requests. `main` queda solo para versiones estables (decisión D-005).
- La aprobación de los Pull Requests la da el comité de control de cambios (Katherine Moyolema y Anahi Molina), con una aprobación requerida, revisión de code owners y descarte de aprobaciones al subir commits nuevos. Reemplaza a la revisión rotativa (decisión D-005).
- Se redefinen los roles de gestión del equipo en el README.
- Se completa en D-002 el motivo por el que se descartó Spring Boot.
- Se actualizan `docs/FLUJO_GIT.md`, `CONTRIBUTING.md` y `CODEOWNERS` con el nuevo proceso de aprobación.
- Las ramas se conservan tras fusionar solo en el trabajo de código (`feature/*`, `release/*` y `hotfix/*`); la documentación inicial no lleva rama propia.
- La gestión de cambios y de errores se hace con issues de GitHub. Se actualizan las plantillas de issues y de pull requests, `CONTRIBUTING.md` y `docs/CONTROL_DE_CAMBIOS.md` (decisión D-004).
- Se reescribe `docs/CONTROL_DE_CAMBIOS.md`: sin Jira, decide una persona del comité y el estado de las solicitudes se lleva en el tablero (decisión D-004).
- La plantilla de Pull Request agrega casillas para `Closes #n`, etiquetas, milestone y responsable iguales a los del issue, y migraciones (decisión D-006).
- Los issues #1 a #13 se reescriben con títulos y etiquetas normalizados, y los del Sprint 0 (#5 a #12) se adaptan a Supabase y se reparten entre los seis integrantes (decisión D-006).
- Las descripciones de las etiquetas existentes pasan a español.

### Eliminado
- Carpetas vacías del backend de Node.js.
- Carpeta `database/`, reemplazada por `supabase/`.
- Revisión rotativa de Pull Requests.
- Tabla de versiones previstas de `docs/FLUJO_GIT.md`.
- Ramas ya fusionadas en `develop`: `feature/ajuste-revision-prs`, `feature/cambio-stack-spring-boot` y `feature/cambio-stack-supabase`.
- Campos y referencias a Jira (`CAM-n`) de las plantillas y de la guía de contribución.
- Carpeta `docs/capturas/jira/`.
- Etiquetas sin uso: `accessibility`, `good first issue`, `help wanted` y `question`.
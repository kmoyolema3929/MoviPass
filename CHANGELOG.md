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

### Cambiado
- El backend pasa de Node.js/Express a Java con Spring Boot (Maven, Flyway y Spring Security) (PR #2, decisión D-001).
- El backend pasa de Java con Spring Boot a Supabase (PostgreSQL, Auth y Storage) (decisión D-002).
- Se ajusta el proceso de revisión de Pull Requests: el autor fusiona tras la aprobación, se exige comentar la revisión y las ramas se conservan tras fusionar (PR #4).
- Se actualizan el README, `.env.example`, `.gitignore` y `SECURITY.md` con cada cambio de stack.

### Eliminado
- Carpetas vacías del backend de Node.js.
- Carpeta `database/`, reemplazada por `supabase/`.

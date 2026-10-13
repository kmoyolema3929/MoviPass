# Registro de decisiones técnicas

Aquí se documentan las decisiones importantes del proyecto, con su motivo y las alternativas que se descartaron.

## D-001: Backend con Spring Boot

- **Fecha:** 12 de octubre de 2026
- **Estado:** Aprobada
- **Decidida por:** equipo de desarrollo

### Contexto
El proyecto necesita roles de usuario (administrador, cooperativa, oficinista, cliente y bus), venta de asientos sin duplicados, validaciones de datos, subida de comprobantes, correos y tareas programadas (eliminar reservas sin comprobante a las 3 horas).

### Decisión
Usar Java 21 con Spring Boot 3 y Maven para el backend. PostgreSQL como base de datos, con migraciones versionadas en Flyway. El frontend se mantiene en HTML, CSS, JavaScript y Bootstrap 5.

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
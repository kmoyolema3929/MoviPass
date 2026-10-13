# Proceso de control de cambios

Proceso inspirado en ITIL. Las solicitudes de cambio se gestionan como tickets en Jira (código `CAM-n`) y el código se trabaja en GitHub.

**Vigencia:** este proceso se aplica desde el 4 de noviembre de 2026 (Fase 2). Durante la Fase 1 el trabajo se organiza con issues de GitHub, según [CONTRIBUTING.md](../CONTRIBUTING.md).

## 1. Comité de control de cambios

| Miembro | Rol en el comité |
|---|---|
| Alisson Paredes | Miembro del comité |
| Anahi Molina | Miembro del comité |
| Katherine Moyolema | Líder del proyecto: voto de desempate y autoridad sobre el repositorio (no es miembro votante) |

### Funciones del comité
1. **Evaluar** cada solicitud de cambio recibida.
2. **Analizar** el impacto y el riesgo sobre los demás módulos.
3. **Decidir**: aprobar, rechazar, cancelar o pedir más información.
4. **Priorizar** los cambios aprobados.
5. **Asignar** al desarrollador responsable.
6. **Autorizar** los cambios de emergencia.
7. **Verificar** que el cambio implementado cumple lo aprobado antes de cerrar el ticket.
8. **Justificar** por escrito, dentro del ticket, cada rechazo o cancelación.
9. **Auditar**: mantener el dashboard y los reportes de cambios.

### Funciones de la líder (Git master)
- Administra el repositorio, las ramas protegidas y los releases.
- Revisa los Pull Requests, incluso los de cambios aprobados por el comité.
- Emite el **voto de desempate** si los dos miembros no coinciden.
- Atiende las solicitudes de emergencia si ningún miembro del comité está disponible, y lo deja documentado.

## 2. Reglas de decisión
- Una solicitud se aprueba con el **acuerdo de los dos miembros**.
- Si no coinciden, decide el voto de la líder.
- **Nadie aprueba, rechaza ni verifica un cambio propio.** Si un miembro del comité es el solicitante, decide el otro miembro con el voto de la líder.
- Toda decisión queda registrada en el ticket con fecha, responsable y justificación.
- Un cambio **no se implementa** sin estado *Aprobado*.

## 3. Tipos de cambio
| Tipo | Descripción | Aprobación |
|---|---|---|
| **Normal** | Cambio planificado que sigue todo el flujo | Comité |
| **Emergencia** | Corrección urgente de un fallo crítico | Un miembro del comité (o la líder si no hay disponibilidad). Se documenta después |
| **Estándar** | Cambio menor y repetitivo de bajo riesgo (por ejemplo, texto o estilo) | Un miembro del comité |

## 4. Flujo de la solicitud
```
Solicitud → En análisis → Aprobado → En desarrollo → Verificación → Cerrado
                 ↓
      Rechazado / Cancelado (con justificación en el ticket)
```

| Estado | Responsable | Descripción |
|---|---|---|
| Solicitud | Solicitante | Se registra con la plantilla de solicitud de cambio |
| En análisis | Comité | Se evalúa necesidad, impacto y riesgo |
| Aprobado | Comité | Se autoriza, se prioriza y se asigna al desarrollador |
| Rechazado | Comité | No procede; se explica el motivo |
| En desarrollo | Desarrollador asignado | Se implementa en una rama con el código del ticket |
| Verificación | Comité | Se comprueba que el cambio funciona y no rompe otros módulos |
| Cerrado | Comité | Cambio completado con éxito |
| Cancelado | Comité o solicitante | Se detiene; se explica el motivo en el ticket |

## 5. Información mínima de una solicitud
- Descripción del cambio y motivo.
- Componentes afectados.
- Análisis de impacto y riesgo (bajo, medio o alto).
- Plan de pruebas y plan de reversa.
- Tipo de cambio y prioridad.

## 6. Relación con Git y GitHub
1. Un ticket aprobado genera una rama con su código: `feature/CAM-12-descripcion` o `hotfix/CAM-15-descripcion`.
2. El Pull Request indica el ticket y es revisado por la líder y/o el comité.
3. Al fusionarse, el ticket pasa a *Verificación*.
4. Los cambios de emergencia usan ramas `hotfix/*` desde `main`.

## 7. Auditoría y reportes
El dashboard de Jira, con filtro por rango de fechas, muestra:
- Total de cambios realizados.
- Cambios cerrados con éxito.
- Cambios cancelados y rechazados.
- Cambios de emergencia.
- Estadísticas generales y por persona.

La justificación de cada cancelación se registra **en el ticket**, no en el dashboard. Las decisiones del comité se resumen en `docs/ACTAS_COMITE.md`.

## 8. Cambios al proceso
Una modificación a este documento (por ejemplo, cambiar la composición del comité) se registra como solicitud de cambio.
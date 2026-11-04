# Proceso de control de cambios

Proceso inspirado en ITIL. Las solicitudes de cambio se gestionan como issues de GitHub y el código se trabaja en GitHub. Cada Pull Request indica `Closes #n` para vincularse a su issue. Las decisiones sobre la herramienta están en [DECISIONES.md](DECISIONES.md) (D-004).

**Vigencia:** este proceso se aplica a todo el trabajo del proyecto desde el Sprint 0. El uso diario del repositorio está en [CONTRIBUTING.md](../CONTRIBUTING.md) y el flujo de ramas en [FLUJO_GIT.md](FLUJO_GIT.md).

## 1. Comité de control de cambios

| Miembro | Rol en el comité |
|---|---|
| Katherine Moyolema | Miembro del comité y líder del proyecto |
| Anahi Molina | Miembro del comité |

### Funciones del comité
1. **Evaluar** cada solicitud de cambio recibida.
2. **Analizar** el impacto y el riesgo sobre los demás módulos.
3. **Decidir**: aprobar, rechazar, cancelar o pedir más información.
4. **Priorizar** los cambios aprobados.
5. **Asignar** al desarrollador responsable.
6. **Autorizar** los cambios de emergencia.
7. **Aprobar los Pull Requests** hacia `develop` y `main`.
8. **Verificar** que el cambio implementado cumple lo aprobado antes de cerrar el issue.
9. **Justificar** por escrito, dentro del issue, cada rechazo o cancelación.
10. **Auditar**: mantener el tablero y los reportes de cambios.

### Funciones de la líder
- Administra el repositorio, las ramas protegidas y los releases.
- Puede subir directamente a `develop` los cambios de la documentación inicial (ver [CONTRIBUTING.md](../CONTRIBUTING.md)).
- Atiende las solicitudes de emergencia si la otra miembro del comité no está disponible, y lo deja documentado.

## 2. Reglas de decisión
- Una solicitud la decide **una de las dos miembros del comité**.
- **Nadie aprueba, rechaza ni verifica un cambio propio.** Si una miembro del comité es la solicitante, decide la otra.
- Toda decisión queda registrada en el issue con fecha, responsable y justificación.
- Un cambio **no se implementa** sin estado *Aprobado*.

## 3. Tipos de cambio
| Tipo | Descripción | Aprobación |
|---|---|---|
| **Normal** | Cambio planificado que sigue todo el flujo | Comité |
| **Emergencia** | Corrección urgente de un fallo crítico | Una miembro del comité (o la líder si no hay disponibilidad). Se documenta después |
| **Estándar** | Cambio menor y repetitivo de bajo riesgo (por ejemplo, texto o estilo) | Una miembro del comité |

## 4. Flujo de la solicitud
```
Solicitud → En análisis → Aprobado → En desarrollo → Verificación → Cerrado
                 ↓
      Rechazado / Cancelado (con justificación en el issue)
```

| Estado | Responsable | Descripción |
|---|---|---|
| Solicitud | Solicitante | Se registra con la plantilla **Solicitud de cambio** |
| En análisis | Comité | Se evalúa necesidad, impacto y riesgo |
| Aprobado | Comité | Se autoriza, se prioriza y se asigna a quien lo desarrolla |
| Rechazado | Comité | No procede; se explica el motivo |
| En desarrollo | Responsable asignado | Se implementa en una rama vinculada al issue |
| Verificación | Comité | Se comprueba que el cambio funciona y no rompe otros módulos |
| Cerrado | Comité | Cambio completado con éxito |
| Cancelado | Comité o solicitante | Se detiene; se explica el motivo en el issue |

El estado se lleva en el campo **Estado** del tablero de GitHub Projects del repositorio. El cierre del issue es el único estado que GitHub controla por sí mismo.

## 5. Información mínima de una solicitud
- Descripción del cambio y motivo.
- Componentes afectados.
- Análisis de impacto y riesgo (bajo, medio o alto).
- Plan de pruebas y plan de reversa.
- Tipo de cambio y prioridad.

## 6. Títulos y etiquetas de los issues

Para que los reportes sean fiables, todo issue y todo Pull Request cumple estas reglas.

**Título:** `[TIPO] Módulo: verbo en infinitivo y qué se hace`, por ejemplo `[DOCS] Documentación: crear modelo de datos`. El tipo y el módulo del título coinciden siempre con las etiquetas.

**Etiquetas obligatorias** (una de cada grupo):

| Grupo | Etiquetas |
|---|---|
| Tipo | `feature`, `docs`, `chore`, `bug`, `cambio` |
| Prioridad | `prioridad: baja`, `prioridad: media`, `prioridad: alta`, `prioridad: crítica` |
| Módulo | `módulo: base`, `módulo: autenticación`, `módulo: cooperativas y buses`, `módulo: frecuencias y rutas`, `módulo: búsqueda y asientos`, `módulo: compra y pago`, `módulo: oficinista y configuración`, `módulo: documentación` |

Las etiquetas `duplicate`, `invalid` y `wontfix` se usan solo para cerrar un issue sin completarlo.

**Además:** milestone, responsable asignado y, al cerrarse, motivo *Completed* o *Not planned* con un comentario.

**El Pull Request** lleva las mismas etiquetas, el mismo milestone y el mismo responsable que su issue. Esto se hace a mano al abrir el PR.

## 7. Relación con Git y GitHub
1. Un issue aprobado genera una rama `feature/descripcion`; una emergencia usa `hotfix/descripcion` desde `main`.
2. El Pull Request indica `Closes #n` en su descripción y lo aprueba el comité.
3. Al fusionarse en `develop`, el issue se cierra solo (es la rama predeterminada). Una solicitud de cambio pasa antes por *Verificación*.
4. Los cambios de la documentación inicial que sube la líder directamente a `develop` se cierran con `Closes #n` en el mensaje del commit.

## 8. Auditoría y reportes
El tablero de GitHub Projects, con sus gráficos (**Insights**) y filtro por fechas, muestra:
- Total de cambios realizados.
- Cambios cerrados con éxito.
- Cambios cancelados y rechazados.
- Cambios de emergencia.
- Estadísticas por tipo, módulo, prioridad y responsable.

La justificación de cada cancelación se registra **en el issue**, no en el tablero. Las decisiones del comité se resumen en `docs/ACTAS_COMITE.md`.

## 9. Cambios al proceso
Una modificación a este documento (por ejemplo, cambiar la composición del comité) se registra como solicitud de cambio y, si es una decisión del equipo, como una nueva entrada en `DECISIONES.md`.
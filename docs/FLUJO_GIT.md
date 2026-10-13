# Flujo de trabajo en Git

Se usa **Gitflow**, porque separa lo estable (`main`) de lo que está en desarrollo (`develop`), permite trabajar en paralelo en ramas `feature/*` y facilita las versiones y las correcciones urgentes.

Ver reglas de uso diario en [CONTRIBUTING.md](../CONTRIBUTING.md).

## Ramas

| Rama | Se crea desde | Se fusiona hacia | Vida |
|---|---|---|---|
| `main` | n/a | n/a | Permanente. Solo versiones estables |
| `develop` | `main` | n/a | Permanente. Integración del trabajo |
| `feature/*` | `develop` | `develop` | Se conserva tras fusionar |
| `release/*` | `develop` | `main` y `develop` | Se conserva tras fusionar |
| `hotfix/*` | `main` | `main` y `develop` | Se conserva tras fusionar |

## Diagrama

```
main      ●───────────────────────────●──────────────●
           \                         / \            /
hotfix      \                       /   ●──────────●  (emergencia)
             \                     /
release       \          ●────────●
               \        /          \
develop         ●──●──●──●──●──●────●──●──●
                    \    /
feature              ●──●
```

## Recorrido de un cambio

1. **Desarrollo:** se crea `feature/*` desde `develop`, se hacen commits y se abre un PR hacia `develop`.
2. **Revisión:** el revisor asignado según la revisión rotativa aprueba el PR. Nadie aprueba su propio PR.
3. **Integración:** una vez aprobado el PR y resueltas las conversaciones, el **autor** lo fusiona a develop con *Create a merge commit*. La rama no se borra, se conserva como evidencia.
4. **Versión:** cuando `develop` tiene lo necesario, se crea `release/vX.Y.Z`, se corrigen detalles finales y se fusiona a `main` y de vuelta a `develop`.
5. **Etiqueta:** en `main` se crea la etiqueta de la versión (por ejemplo `v0.1.0`).
6. **Emergencia:** un fallo crítico en `main` se corrige en `hotfix/*`, que se fusiona a `main` y a `develop`.

## Revisión rotativa de Pull Requests

Los PRs hacia `develop` se revisan en círculo. Cada persona revisa a la siguiente de la lista:

Katherine → Alisson → Anahi → Alina → Mateo → Julio → Katherine

El detalle de cómo se aplica (plazo de 24 horas y reemplazos) está en [CONTRIBUTING.md](../CONTRIBUTING.md).

## Versiones previstas

| Versión | Fecha | Contenido |
|---|---|---|
| `v0.1.0` | 4 de noviembre | Aplicación de la Fase 1 (con errores conocidos, sin el módulo del chofer) |
| `v1.0.0` | Cierre de la Fase 2 | Errores corregidos y módulo del chofer incluido |

Se usa [Versionado Semántico](https://semver.org/lang/es/).

## Protección de ramas

| Regla | `main` | `develop` |
|---|---|---|
| Pull Request obligatorio, sin push directo | Sí | Sí |
| Aprobaciones requeridas | 1 | 1 |
| Aprobación de un code owner (Katherine o Alisson) | **Sí** | No |
| Conversaciones resueltas antes de fusionar | Sí | Sí |
| Force push y borrado de la rama | Prohibidos | Prohibidos |

En `main`, solo Katherine Moyolema y Alisson Paredes pueden aprobar. En `develop`, aprueba quien corresponda según la revisión rotativa.

## Método de fusión

Se usa **Create a merge commit**. Así se conserva el historial completo de commits de cada persona. No se usan *Squash and merge* ni *Rebase and merge*.
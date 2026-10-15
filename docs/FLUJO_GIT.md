# Flujo de trabajo en Git

Se usa **Gitflow**, porque separa lo estable (`main`) de lo que está en desarrollo (`develop`), permite trabajar en paralelo en ramas `feature/*` y facilita las versiones y las correcciones urgentes.

La rama predeterminada del repositorio es `develop`. Así, los issues enlazados con `Closes #n` se cierran solos al fusionar el Pull Request. `main` guarda solo versiones estables.

Ver reglas de uso diario en [CONTRIBUTING.md](../CONTRIBUTING.md).

## Ramas

| Rama | Se crea desde | Se fusiona hacia | Vida |
|---|---|---|---|
| `main` | n/a | n/a | Permanente. Solo versiones estables |
| `develop` | `main` | n/a | Permanente. Rama predeterminada e integración del trabajo |
| `feature/*` | `develop` | `develop` | Se conserva tras fusionar |
| `release/*` | `develop` | `main` y `develop` | Se conserva tras fusionar |
| `hotfix/*` | `main` | `main` y `develop` | Se conserva tras fusionar |

Los cambios de la documentación inicial no llevan rama propia (ver [Excepción de la líder](#excepción-de-la-líder)).

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

1. **Desarrollo:** se crea `feature/*` desde `develop`, se hacen commits y se abre un PR hacia `develop`. El PR indica `Closes #n` para vincularlo a su issue.
2. **Revisión:** el comité de control de cambios (Katherine o Anahi) revisa el PR y deja un comentario con su revisión. Nadie aprueba su propio PR.
3. **Integración:** una vez aprobado el PR y resueltas las conversaciones, el **autor** lo fusiona a `develop` con *Create a merge commit*. El issue se cierra automáticamente.
4. **Versión:** cuando `develop` tiene lo necesario, se crea `release/vX.Y.Z`, se corrigen detalles finales y se fusiona a `main` y de vuelta a `develop`.
5. **Etiqueta:** en `main` se crea la etiqueta de la versión (por ejemplo `v0.1.0`).
6. **Emergencia:** un fallo crítico en `main` se corrige en `hotfix/*`, que se fusiona a `main` y a `develop`.

Las versiones siguen el [Versionado Semántico](https://semver.org/lang/es/).

## Aprobación de Pull Requests

Los PR hacia `develop` y hacia `main` los aprueba el comité de control de cambios, formado por **Katherine Moyolema** y **Anahi Molina**. Basta la aprobación de una de las dos:

- Los PR de Alisson, Alina, Mateo y Julio los aprueba Katherine o Anahi.
- Los PR de Katherine los aprueba Anahi, y los de Anahi los aprueba Katherine.

El plazo de revisión y los reemplazos en caso de ausencia están en [CONTRIBUTING.md](../CONTRIBUTING.md).

## Excepción de la líder

La líder del proyecto (Katherine Moyolema) puede subir directamente a `develop`, sin rama ni Pull Request, los cambios de la **documentación inicial** del repositorio. Todo lo demás (código, migraciones y pantallas) entra por Pull Request con la aprobación del comité.

## Protección de ramas

| Regla | `main` | `develop` |
|---|---|---|
| Pull Request obligatorio, sin push directo | Sí | Sí (excepción de la líder en documentación inicial) |
| Aprobaciones requeridas | 1 | 1 |
| Aprobación de un code owner (Katherine o Anahi) | Sí | Sí |
| Descartar aprobaciones al subir commits nuevos | Sí | Sí |
| Conversaciones resueltas antes de fusionar | Sí | Sí |
| Force push y borrado de la rama | Prohibidos | Prohibidos |

Al fusionar en `main`, Netlify publica automáticamente la nueva versión del frontend.

## Método de fusión

Se usa **Create a merge commit**. Así se conserva el historial completo de commits de cada persona. No se usan *Squash and merge* ni *Rebase and merge*.
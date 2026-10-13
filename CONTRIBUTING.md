# Guía de contribución

Gracias por colaborar en MoviPass. Lee esta guía antes de tu primer cambio.

## Regla principal
**Ningún cambio se implementa sin un issue (Fase 1) o un ticket aprobado por el comité (Fase 2).** Nadie hace push directo a `main` ni a `develop`.

## Flujo de ramas (Gitflow)
| Rama | Uso |
|---|---|
| `main` | Versión estable. Solo recibe fusiones desde `release/*` y `hotfix/*` |
| `develop` | Integración del trabajo |
| `feature/*` | Una rama por tarea: funcionalidad, documentación, configuración o corrección de errores |
| `release/*` | Preparación de una versión. Al terminar se fusiona a `main` y de vuelta a `develop` |
| `hotfix/*` | Corrección urgente sobre `main`. Al terminar se fusiona a `main` y a `develop` |

Nombres: `feature/crud-buses`, `feature/manual-usuario`. En la Fase 2 se agrega el ticket: `feature/CAM-12-qr-boleto`, `hotfix/CAM-15-login-caido`.

## Ciclo de trabajo
1. Toma un issue asignado a ti.
2. Actualiza `develop`: `git checkout develop && git pull`.
3. Crea tu rama: `git checkout -b feature/nombre-corto`.
4. Haz commits pequeños y claros.
5. Sube la rama: `git push -u origin feature/nombre-corto`.
6. Abre un Pull Request hacia `develop` con `Closes #N` y asigna a tu revisor según el orden de rotación.
7. Espera la revisión. No fusiones tu propio PR.

## Formato de commits
`tipo: descripción corta en minúsculas`

| Tipo | Uso |
|---|---|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de error |
| `docs` | Documentación |
| `refactor` | Cambio de código sin cambiar comportamiento |
| `test` | Pruebas |
| `chore` | Tareas de mantenimiento |

Ejemplo: `feat: agregar selección de asientos`

En la Fase 2 se agrega el ticket al final: `fix: corregir generación del QR (CAM-12)`.

## Pull Requests
- Siempre hacia `develop` (excepto release y hotfix).
- Requieren **1 aprobación**. Nadie aprueba su propio PR.
- Deben usar la plantilla y enlazar el issue.
- Resuelve los comentarios antes de fusionar.
- La fusión la hace el **autor del PR**, después de responder los comentarios del revisor y de recibir la aprobación, usando **Create a merge commit**, para conservar el historial de commits.
- **Las ramas no se borran** al fusionar: se conservan como evidencia del trabajo.
- Cada revisión debe dejar al menos un comentario o sugerencia, y el autor debe responderlo.
- Los PRs hacia `main` (release y hotfix) solo pueden ser aprobados por Katherine Moyolema o Alisson Paredes. Si una de las dos abre el PR, lo aprueba la otra.

### Revisión rotativa
Los PRs hacia `develop` se revisan en círculo, de forma ordenada. Cada persona revisa a la siguiente de la lista, y la última cierra el círculo:

| Autor del PR | Lo revisa |
|---|---|
| Katherine Moyolema | Alisson Paredes |
| Alisson Paredes | Anahi Molina |
| Anahi Molina | Alina Ortiz |
| Alina Ortiz | Mateo Herrera |
| Mateo Herrera | Julio Zurita |
| Julio Zurita | Katherine Moyolema |

Cómo se aplica:
1. Al abrir el PR, el autor asigna a su revisor en *Reviewers*.
2. El revisor tiene **24 horas** para revisar. Si no responde, lo reemplaza la líder o un miembro del comité.
3. El revisor deja comentarios o sugerencias y, si todo está bien, aprueba. No fusiona.
4. El autor responde cada comentario, aplica los cambios, resuelve las conversaciones y fusiona.
5. Si la revisión se hace en conjunto, el PR se aprueba igual con una sola aprobación formal, y el resto de comentarios se dejan en el PR.

### Antes de abrir un PR
- [ ] Mi rama parte de `develop` y sigue la convención de nombres.
- [ ] Probé los cambios en mi computador.
- [ ] No incluyo `.env`, contraseñas ni archivos subidos por usuarios.
- [ ] Actualicé la documentación y el `CHANGELOG.md` si hizo falta.

## Control de cambios
Desde la Fase 2, toda modificación pasa por una solicitud de cambio. Ver [docs/CONTROL_DE_CAMBIOS.md](docs/CONTROL_DE_CAMBIOS.md).

## Código de conducta
Al participar aceptas el [Código de Conducta](CODE_OF_CONDUCT.md).
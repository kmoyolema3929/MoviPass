# Guía de contribución

Gracias por colaborar en MoviPass. Lee esta guía antes de tu primer cambio.

## Regla principal
**Ningún cambio se implementa sin un issue.** El código y las migraciones entran siempre por Pull Request. La única excepción es la de la líder para la documentación inicial (ver [Excepción de la líder](#excepción-de-la-líder)).

## Flujo de ramas (Gitflow)
| Rama | Uso |
|---|---|
| `main` | Versión estable. Recibe fusiones desde `release/*` y `hotfix/*`, y sincronizaciones desde `develop` aprobadas por el comité |
| `develop` | Rama predeterminada. Integración del trabajo |
| `feature/*` | Una rama por tarea: funcionalidad, documentación, configuración o corrección de errores |
| `release/*` | Preparación de una versión. Al terminar se fusiona a `main` y de vuelta a `develop` |
| `hotfix/*` | Corrección urgente sobre `main`. Al terminar se fusiona a `main` y a `develop` |

Nombres: `feature/crud-buses`, `feature/manual-usuario`, `hotfix/login-caido`.

## Ciclo de trabajo
1. Toma un issue asignado a ti.
2. Actualiza `develop`: `git checkout develop && git pull`.
3. Crea tu rama: `git checkout -b feature/nombre-corto`.
4. Haz commits pequeños y claros.
5. Sube la rama: `git push -u origin feature/nombre-corto`.
6. Abre un Pull Request hacia `develop` con `Closes #N`. GitHub pedirá la revisión al comité automáticamente.
7. Espera la revisión. No fusiones sin aprobación.

## Formato de commits
Seguimos **Conventional Commits**: `tipo(ámbito): descripción corta en minúsculas`.

| Tipo | Uso |
|---|---|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de error |
| `docs` | Documentación |
| `refactor` | Cambio de código sin cambiar comportamiento |
| `test` | Pruebas |
| `chore` | Tareas de mantenimiento y configuración |

El **ámbito** es el módulo o el documento que cambia, en minúsculas y sin tildes:

| Ámbito | Se usa para |
|---|---|
| `base` | Proyecto, conexión, migraciones iniciales y plantilla del frontend |
| `auth` | Autenticación y roles |
| `cooperativas` | Cooperativas y buses |
| `frecuencias` | Frecuencias y hoja de ruta |
| `busqueda` | Búsqueda y asientos |
| `compra` | Compra, pago y boleto |
| `oficinista` | Oficinista, configuración y notificaciones |
| `docs` | Documentación general |
| `readme`, `changelog`, `decisiones`, `contributing` | Un documento concreto |

Ejemplos:
- `feat(compra): agregar selección de asientos`
- `fix(auth): corregir cierre de sesión`
- `docs(readme): actualizar roles del equipo`

Cuando el commit resuelve un issue, se indica en el pie del mensaje: `Closes #n`. Los títulos de los Pull Requests usan el mismo formato.

## Pull Requests
- Siempre hacia `develop` (excepto release, hotfix y la sincronización de `develop` a `main`).
- Requieren **1 aprobación** del comité de control de cambios. Nadie aprueba su propio PR.
- Deben usar la plantilla y enlazar el issue con `Closes #N`.
- Resuelve los comentarios antes de fusionar.
- La fusión la hace el **autor del PR**, después de responder los comentarios y de recibir la aprobación, usando **Create a merge commit**, para conservar el historial de commits.
- **Las ramas `feature/*`, `release/*` y `hotfix/*` no se borran** al fusionar: se conservan como evidencia del trabajo.

### Aprobación de Pull Requests
Los PRs hacia `develop` y hacia `main` los aprueba el **comité de control de cambios**, formado por Katherine Moyolema y Anahi Molina. Basta la aprobación de una de las dos. Nadie aprueba su propio PR:

| Autor del PR | Lo aprueba |
|---|---|
| Alisson Paredes, Alina Ortiz, Mateo Herrera o Julio Zurita | Katherine Moyolema o Anahi Molina |
| Katherine Moyolema | Anahi Molina |
| Anahi Molina | Katherine Moyolema |

Cómo se aplica:
1. Al abrir el PR, GitHub solicita la revisión al comité automáticamente (por el archivo `CODEOWNERS`). El autor indica en la descripción el issue que resuelve, con `Closes #n`.
2. El comité tiene **24 horas** para revisar. Si la persona a quien le tocó no responde, lo revisa la otra. Si ninguna está disponible, el autor avisa al equipo y espera; no se fusiona sin aprobación.
3. Quien revisa deja comentarios o sugerencias y, si todo está bien, aprueba. No fusiona.
4. El autor responde cada comentario, aplica los cambios y resuelve las conversaciones. Si sube commits nuevos después de aprobado, la aprobación se descarta y hay que pedirla otra vez.
5. Con el PR aprobado, el autor lo fusiona con *Create a merge commit*. El issue vinculado se cierra solo.
6. Quien revisa deja un comentario en el PR con lo que revisó, aunque no tenga observaciones, como evidencia del control de cambios.

### Excepción de la líder
La líder del proyecto puede subir directamente a `develop`, sin rama ni Pull Request, los cambios de la **documentación inicial** del repositorio. Todo lo demás (código, migraciones y pantallas) entra por Pull Request con la aprobación del comité.

### Antes de abrir un PR
- [ ] Mi rama parte de `develop` y sigue la convención de nombres.
- [ ] Probé los cambios en mi computador.
- [ ] No incluyo `.env`, contraseñas ni archivos subidos por usuarios.
- [ ] Actualicé la documentación y el `CHANGELOG.md` si hizo falta.
- [ ] Si cambié la base de datos, incluí su migración.

## Cambios en la base de datos
- Todo cambio de tablas, políticas o funciones se hace con un archivo de migración en `supabase/migrations/`. Nunca desde el panel web de Supabase.
- Las migraciones se crean con `npx supabase migration new nombre_corto`. No se editan una vez fusionadas: si hay un error, se agrega una migración nueva.
- Las claves (`service_role`, `config.js`, `.env`) nunca se suben al repositorio.

## Control de cambios
Las modificaciones sobre algo ya existente se piden con un issue de la plantilla **Solicitud de cambio**, que el comité evalúa, aprueba o rechaza antes de implementarse. Ver [docs/CONTROL_DE_CAMBIOS.md](docs/CONTROL_DE_CAMBIOS.md).

## Código de conducta
Al participar aceptas el [Código de Conducta](CODE_OF_CONDUCT.md).
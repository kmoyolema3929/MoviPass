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
- Los PRs hacia `main` (release y hotfix) solo pueden ser aprobados por Katherine Moyolema o ANAHI Molina. Si una de las dos abre el PR, lo aprueba la otra.

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
Desde la Fase 2, toda modificación pasa por una solicitud de cambio. Ver [docs/CONTROL_DE_CAMBIOS.md](docs/CONTROL_DE_CAMBIOS.md).

## Código de conducta
Al participar aceptas el [Código de Conducta](CODE_OF_CONDUCT.md).
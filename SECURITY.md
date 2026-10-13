# Política de seguridad

## Versiones con soporte
| Versión | Soporte |
|---|---|
| `main` (última versión) | Sí |
| Versiones anteriores | No |

## Cómo reportar una vulnerabilidad
**No abras un issue público.** Informa a la líder del proyecto, Katherine Moyolema, por una de estas vías:

- Correo: `kmoyolema3929@gmail.com`
- La opción **Report a vulnerability** de la pestaña *Security* de este repositorio

Incluye:
- Descripción del problema.
- Pasos para reproducirlo.
- Impacto posible.

Responderemos en un máximo de **72 horas**. Si la vulnerabilidad es crítica, se tratará como cambio de emergencia según [docs/CONTROL_DE_CAMBIOS.md](docs/CONTROL_DE_CAMBIOS.md).

## Buenas prácticas del proyecto
- **Nunca** subir contraseñas, tokens o claves al repositorio.
- Las variables sensibles van en un archivo `.env` (ignorado por Git). Se incluye `.env.example` sin valores reales.
- Las contraseñas de usuarios se almacenan con hash, nunca en texto plano.
- Los comprobantes de pago y las cédulas son datos personales: acceso solo para roles autorizados.
- Los datos de prueba no deben contener cédulas, comprobantes ni correos reales.
- Validar y sanear toda entrada de usuario.
- Mantener las dependencias actualizadas.
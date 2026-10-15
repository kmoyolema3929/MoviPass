# Migraciones de la base de datos

Este proyecto usa la **Supabase CLI** para gestionar los cambios en la base de datos. **Nadie modifica tablas desde el panel web de Supabase.** Todos los cambios pasan por archivos de migración versionados en `supabase/migrations/`.

## Requisitos

- Node.js instalado
- Supabase CLI instalada (`npm install supabase --save-dev`)

## Cómo vincular el proyecto (solo la primera vez)

Antes de aplicar migraciones, cada persona que las vaya a ejecutar debe vincular su copia local con el proyecto remoto:

```bash
npx supabase login
npx supabase link --project-ref <reference-id>
```

El Reference ID y la contraseña de la base de datos se entregan solo a quien aplica las migraciones (por canal privado).

## Cómo crear una migración

1. Crea el archivo de migración:

   ```bash
   npx supabase migration new nombre_descriptivo
   ```

   Esto genera un archivo `.sql` vacío en `supabase/migrations/` con el timestamp actual. El nombre del archivo sigue el formato `YYYYMMDDHHMMSS_nombre_descriptivo.sql`.

2. Abre ese archivo `.sql` y escribe los cambios necesarios (crear tabla, agregar columna, definir políticas RLS, etc.).

## Cómo aplicar una migración

Una vez escrita la migración, se aplica al proyecto remoto con:

```bash
npx supabase db push
```

Este comando ejecuta todas las migraciones que aún no se han aplicado. Si ya aplicaste una migración, no se vuelve a ejecutar.

Para verificar que se aplicó, entra al panel de Supabase → **Table Editor** y revisa que la tabla o el cambio aparezca.

## Reglas

- **Nombre del archivo:** lo genera la CLI (timestamp + nombre descriptivo).
- **Nunca** modificar tablas desde el panel web de Supabase. Hacerlo directamente en el remoto rompe el historial de migraciones y hace que `db push` falle.
- **Nunca** subir al repositorio:
  - La contraseña de la base de datos.
  - El token de la CLI.
  - La clave `service_role`.
- Si una migración falla, revisa el error y crea una **nueva migración** para corregir. No edites una migración ya aplicada.
- Toda tabla nueva lleva RLS activado.

## Qué hacer si una migración falla

1. Lee el error completo.
2. Corrige el problema en una **nueva migración** (no edites la anterior).
3. Aplica con `npx supabase db push`.
4. Si el error es de vinculación, revisa que el Reference ID y la contraseña sean correctos.

## Archivos ignorados por Git

La carpeta `supabase/.temp/` está en `.gitignore` y no se sube al repositorio.
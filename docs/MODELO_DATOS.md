# Modelo de datos

Este documento define las convenciones para diseñar la base de datos del proyecto. Todos los módulos deben seguirlas para evitar conflictos entre sí.

## Diagrama general de entidades

```
perfiles (1) ──── (N) notificaciones

cooperativas (1) ──── (N) buses
cooperativas (1) ──── (N) frecuencias
cooperativas (1) ──── (N) hojas_ruta

tipos_bus (1) ──── (N) buses

buses (1) ──── (N) asientos
buses (1) ──── (N) viajes

frecuencias (1) ──── (N) viajes
frecuencias (1) ──── (N) paradas
frecuencias (1) ──── (N) hojas_ruta

paradas (1) ──── (N) hojas_ruta

viajes (1) ──── (N) boletos
viajes (1) ──── (N) pagos

boletos (1) ──── (1) pasajeros
boletos (1) ──── (N) pagos
```

## Entidades principales

| Entidad | Descripción |
|---|---|
| `perfiles` | Usuarios del sistema (vinculados a Supabase Auth) |
| `cooperativas` | Empresas de transporte |
| `buses` | Vehículos de cada cooperativa |
| `tipos_bus` | Categorías de bus (ej. ejecutivo, normal) |
| `asientos` | Asientos de cada bus |
| `frecuencias` | Horarios de salida por ruta |
| `paradas` | Puntos de parada de cada ruta |
| `hojas_ruta` | Recorridos de cada frecuencia |
| `viajes` | Viajes concretos (fecha + frecuencia + bus) |
| `boletos` | Boletos vendidos |
| `pasajeros` | Datos de los pasajeros |
| `pagos` | Pagos de los boletos |
| `notificaciones` | Avisos a los usuarios |

## Reglas de nombres

### Tablas

- **snake_case**, en **plural**, en español
- Ejemplos: `perfiles`, `cooperativas`, `buses`, `tipos_bus`, `asientos`

### Columnas

- **snake_case**, en **singular**, en español
- Ejemplos: `cedula`, `nombres`, `apellidos`, `telefono`, `creado_en`

### Claves primarias

- Siempre se llaman `id`
- Tipo `uuid` con `default gen_random_uuid()`

### Claves foráneas

- Se llaman `<tabla_singular>_id`
- Ejemplos: `cooperativa_id`, `bus_id`, `viaje_id`

### Fechas

- Se llaman `<evento>_en`
- Tipo `timestamptz`
- Ejemplos: `creado_en`, `actualizado_en`, `salida_en`

### Estados

- Tipo `text` con `check` que limita los valores permitidos
- Ejemplo: `estado text not null default 'activo' check (estado in ('activo', 'inactivo', 'cancelado'))`

## Formato de los nombres de migraciones

Los nombres los genera la CLI con:

```bash
npx supabase migration new nombre_descriptivo
```

El archivo resultante sigue el formato:

```
YYYYMMDDHHMMSS_nombre_descriptivo.sql
```

Ejemplo: `20261015120000_crear_tabla_prueba.sql`

## Permisos por rol

Esta tabla es la base para las políticas RLS:

| Entidad | administrador | cooperativa | oficinista | cliente | bus |
|---|---|---|---|---|---|
| `perfiles` | CRUD todos | Ver y editar el suyo | Ver y editar el suyo | Ver y editar el suyo | Ver y editar el suyo |
| `cooperativas` | CRUD todos | Ver y editar la suya | Ver | Ver | — |
| `buses` | CRUD todos | CRUD los suyos | Ver | Ver | — |
| `tipos_bus` | CRUD todos | Ver | Ver | Ver | — |
| `asientos` | CRUD todos | CRUD los suyos | Ver | Ver | Ver |
| `frecuencias` | CRUD todos | CRUD las suyas | Ver | Ver | Ver |
| `paradas` | CRUD todos | CRUD las suyas | Ver | Ver | Ver |
| `hojas_ruta` | CRUD todos | CRUD las suyas | Ver | Ver | Ver |
| `viajes` | CRUD todos | CRUD los suyos | Ver y editar | Ver | Ver |
| `boletos` | CRUD todos | Ver los suyos | CRUD | CRUD los suyos | Ver |
| `pasajeros` | CRUD todos | Ver los suyos | CRUD | Ver el suyo | — |
| `pagos` | CRUD todos | Ver los suyos | CRUD | CRUD los suyos | — |
| `notificaciones` | CRUD todos | Ver las suyas | Ver las suyas | Ver las suyas | Ver las suyas |

**CRUD** = Crear, Leer, Actualizar, Eliminar.

## RLS

**Toda tabla nueva lleva RLS activado.** Esto es obligatorio:

```sql
alter table public.nombre_tabla enable row level security;
```

Las políticas se definen en la misma migración que crea la tabla.
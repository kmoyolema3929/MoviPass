-- Reglas de negocio de las hojas de ruta (documento del profesor):
--  * "una ruta solo puede ir un bus al día"  -> una frecuencia tiene un solo bus por fecha
--  * un bus solo hace una frecuencia por día -> en la hoja de ruta cada bus aparece una vez por fecha
--
-- ANTES de ejecutar, comprueba que no haya datos repetidos. Si alguna de estas
-- consultas devuelve filas, borra o corrige esos registros; si no, la migración falla.
--
--   select frecuencia_id, fecha, count(*)
--   from public.hojas_ruta group by 1, 2 having count(*) > 1;
--
--   select bus_id, fecha, count(*)
--   from public.hojas_ruta group by 1, 2 having count(*) > 1;

begin;

alter table public.hojas_ruta
  add constraint hojas_ruta_frecuencia_fecha_unique
    unique (frecuencia_id, fecha),
  add constraint hojas_ruta_bus_fecha_unique
    unique (bus_id, fecha);

commit;

-- =====================================================================
-- MoviPass · Reglas de frecuencias y hoja de ruta (según los apuntes)
--   1. El número de resolución de la frecuencia es obligatorio.
--   2. La hoja de ruta no se crea con más de 14 días de anticipación.
--   3. Solo se puede asignar un bus que ya tenga plantilla de asientos.
--   4. No se cambia el bus/frecuencia/fecha de una hoja de un día pasado.
-- Ya existen (no se tocan):
--   · UNIQUE (frecuencia_id, fecha): una frecuencia, un bus por día.
--   · UNIQUE (bus_id, fecha): un bus no puede estar en dos frecuencias el mismo día.
-- =====================================================================

-- 1. Número de resolución obligatorio ---------------------------------
-- Las frecuencias que ya existían sin resolución quedan con un valor
-- temporal (PENDIENTE-<id>) para poder exigir el campo; edítalas luego.
update public.frecuencias
set numero_resolucion = 'PENDIENTE-' || id
where numero_resolucion is null
   or btrim(numero_resolucion) = '';

update public.frecuencias
set numero_resolucion = btrim(numero_resolucion)
where numero_resolucion <> btrim(numero_resolucion);

alter table public.frecuencias
    alter column numero_resolucion set not null;

alter table public.frecuencias
    drop constraint if exists frecuencias_resolucion_check;

alter table public.frecuencias
    add constraint frecuencias_resolucion_check
    check (length(btrim(numero_resolucion)) > 0);

-- 2. a 4. Validación de la hoja de ruta -------------------------------
-- Reemplaza la función; el trigger hojas_ruta_validar ya la usa.
create or replace function public.validar_hoja_ruta()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_activa boolean;
  v_coop_frecuencia uuid;
  v_coop_bus uuid;
  v_tipo_bus text;
  v_hoy date;
begin
  v_hoy := (now() at time zone 'America/Guayaquil')::date;

  select f.activa, f.cooperativa_id
    into v_activa, v_coop_frecuencia
  from public.frecuencias as f
  where f.id = new.frecuencia_id;

  select b.cooperativa_id, b.tipo_bus
    into v_coop_bus, v_tipo_bus
  from public.buses as b
  where b.id = new.bus_id;

  if tg_op = 'INSERT' then
    if new.fecha < v_hoy then
      raise exception 'No se pueden crear hojas de ruta con fechas pasadas.'
        using errcode = '23514';
    end if;

    if new.fecha > v_hoy + 14 then
      raise exception 'No se pueden crear hojas de ruta con más de 14 días de anticipación.'
        using errcode = '23514';
    end if;

    if v_activa is not true then
      raise exception 'La frecuencia está desactivada.'
        using errcode = '23514';
    end if;
  else
    -- Una hoja de un día pasado ya no se reasigna.
    if old.fecha < v_hoy
       and (
         new.bus_id is distinct from old.bus_id
         or new.frecuencia_id is distinct from old.frecuencia_id
         or new.fecha is distinct from old.fecha
       ) then
      raise exception 'No se puede cambiar una hoja de ruta de un día pasado.'
        using errcode = '23514';
    end if;
  end if;

  if v_coop_frecuencia is not null
     and v_coop_frecuencia is distinct from v_coop_bus then
    raise exception 'El bus pertenece a otra cooperativa distinta a la de la frecuencia.'
      using errcode = '23514';
  end if;

  -- Solo buses cuyo tipo ya tiene plantilla de asientos.
  if tg_op = 'INSERT' or new.bus_id is distinct from old.bus_id then
    if not exists (
      select 1
      from public.plantillas_bus as pb
      where pb.cooperativa_id = v_coop_bus
        and lower(btrim(pb.tipo_bus)) = lower(btrim(v_tipo_bus))
    ) then
      raise exception 'El bus no tiene plantilla de asientos. Configúrala antes de asignarlo.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

notify pgrst, 'reload schema';

-- Nota sobre "eliminar solo si no hay boletos vendidos":
-- todavía no existe la tabla de boletos. Cuando la crees, hazla referenciar
-- a viajes(id) con ON DELETE RESTRICT: así borrar una hoja de ruta con boletos
-- falla con el código 23503 y la pantalla ya muestra el aviso correspondiente.

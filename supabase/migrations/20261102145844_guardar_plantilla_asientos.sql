-- Guardado atómico de plantillas y asientos
-- Issue #31
--
-- Al crear: p_actualizado_en_esperado = null.
-- Al editar: enviar el actualizado_en obtenido al cargar la plantilla.

create or replace function public.guardar_plantilla_asientos(
  p_bus_id uuid,
  p_distribucion jsonb,
  p_actualizado_en_esperado timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_rol text;
  v_bus_autorizado uuid;
  v_numero_pisos integer;
  v_indice integer;
  v_piso jsonb;
  v_campo text;
  v_valor numeric;
  v_limite integer;
  v_cantidad integer;
  v_filas integer;
  v_columnas integer;
  v_total integer := 0;
  v_desplazamiento integer := 0;
  v_tipo text;
  v_distribucion jsonb := '[]'::jsonb;
  v_ahora timestamptz;
  v_plantilla public.plantillas_asientos%rowtype;
begin
  -- 1. Comprobar la sesión y el rol real del usuario.
  v_usuario := auth.uid();
  v_rol := public.rol_actual();

  if v_usuario is null
     or v_rol is null
     or v_rol not in ('administrador', 'cooperativa') then
    raise exception 'No tienes permiso para guardar plantillas.'
      using errcode = '42501';
  end if;

  -- 2. Validar la distribución antes de modificar datos.
  if jsonb_typeof(p_distribucion) is distinct from 'array' then
    raise exception 'La distribución debe ser una lista de pisos.'
      using errcode = '22023';
  end if;

  v_numero_pisos := jsonb_array_length(p_distribucion);

  if v_numero_pisos not in (1, 2) then
    raise exception 'El bus debe tener uno o dos pisos.'
      using errcode = '22023';
  end if;

  for v_indice in 0..(v_numero_pisos - 1) loop
    v_piso := p_distribucion -> v_indice;

    if jsonb_typeof(v_piso) is distinct from 'object' then
      raise exception 'La configuración del piso % no es válida.',
        v_indice + 1
        using errcode = '22023';
    end if;

    foreach v_campo in array array['cantidad', 'filas', 'columnas']
    loop
      if jsonb_typeof(v_piso -> v_campo) is distinct from 'number' then
        raise exception 'El campo % del piso % debe ser numérico.',
          v_campo, v_indice + 1
          using errcode = '22023';
      end if;

      v_valor := (v_piso ->> v_campo)::numeric;

      v_limite := case
        when v_campo = 'columnas' then 4
        else 60
      end;

      if v_valor <> trunc(v_valor)
         or v_valor < 1
         or v_valor > v_limite then
        raise exception
          'El campo % del piso % debe ser un entero entre 1 y %.',
          v_campo, v_indice + 1, v_limite
          using errcode = '22023';
      end if;
    end loop;

    v_cantidad := (v_piso ->> 'cantidad')::numeric::integer;
    v_filas := (v_piso ->> 'filas')::numeric::integer;
    v_columnas := (v_piso ->> 'columnas')::numeric::integer;

    if v_filas <> (v_cantidad + v_columnas - 1) / v_columnas then
      raise exception
        'Las filas del piso % no corresponden a su cantidad de asientos y columnas.',
        v_indice + 1
        using errcode = '22023';
    end if;

    v_total := v_total + v_cantidad;

    -- Conservar únicamente los campos validados.
    v_distribucion := v_distribucion || jsonb_build_array(
      jsonb_build_object(
        'numero', v_indice + 1,
        'cantidad', v_cantidad,
        'filas', v_filas,
        'columnas', v_columnas
      )
    );
  end loop;

  if v_total > 60
     or (v_numero_pisos = 2 and v_total < 40) then
    raise exception
      'Capacidad inválida: máximo 60 asientos; en dos pisos, entre 40 y 60.'
      using errcode = '22023';
  end if;

  -- 3. Autorizar el bus y bloquearlo durante el guardado.
  -- Dos guardados del mismo bus se procesan en orden.
  select b.id
    into v_bus_autorizado
  from public.buses as b
  where b.id = p_bus_id
    and (
      v_rol = 'administrador'
      or exists (
        select 1
        from public.cooperativas_usuarios as asignacion
        where asignacion.cooperativa_id = b.cooperativa_id
          and asignacion.perfil_id = v_usuario
      )
    )
  for update of b;

  if not found then
    raise exception 'El bus no está disponible para esta cuenta.'
      using errcode = '42501';
  end if;

  -- 4. Comprobar si existe una plantilla previa.
  select pa.*
    into v_plantilla
  from public.plantillas_asientos as pa
  where pa.bus_id = p_bus_id
  for update;

  if found then
    if p_actualizado_en_esperado is null
       or v_plantilla.actualizado_en
          is distinct from p_actualizado_en_esperado then
      raise exception
        'La plantilla cambió desde que la abriste. Vuelve a cargarla antes de guardar.'
        using errcode = '40001';
    end if;

    -- Si la distribución no cambió, conservar los asientos y sus IDs.
    if v_plantilla.numero_pisos = v_numero_pisos
       and v_plantilla.total_asientos = v_total
       and v_plantilla.distribucion = v_distribucion then
      return to_jsonb(v_plantilla);
    end if;

    v_ahora := clock_timestamp();

    if v_ahora <= v_plantilla.actualizado_en then
      v_ahora := v_plantilla.actualizado_en + interval '1 microsecond';
    end if;

    update public.plantillas_asientos as pa
    set numero_pisos = v_numero_pisos,
        total_asientos = v_total,
        distribucion = v_distribucion,
        actualizado_en = v_ahora
    where pa.id = v_plantilla.id
    returning pa.* into v_plantilla;
  else
    if p_actualizado_en_esperado is not null then
      raise exception
        'La plantilla anterior ya no existe. Vuelve a cargar el bus.'
        using errcode = '40001';
    end if;

    insert into public.plantillas_asientos (
      bus_id,
      numero_pisos,
      total_asientos,
      distribucion,
      actualizado_en
    )
    values (
      p_bus_id,
      v_numero_pisos,
      v_total,
      v_distribucion,
      clock_timestamp()
    )
    returning * into v_plantilla;
  end if;

  -- 5. Reemplazar la estructura del bus autorizado.
  -- Un error revierte también los cambios de la plantilla.
  delete from public.asientos as a
  where a.bus_id = p_bus_id;

  for v_indice in 0..(v_numero_pisos - 1) loop
    v_piso := v_distribucion -> v_indice;
    v_cantidad := (v_piso ->> 'cantidad')::integer;
    v_columnas := (v_piso ->> 'columnas')::integer;

    v_tipo := case
      when v_numero_pisos = 2 and v_indice = 0 then 'vip'
      else 'normal'
    end;

    insert into public.asientos (
      bus_id,
      numero,
      piso,
      fila,
      columna,
      tipo
    )
    select
      p_bus_id,
      v_desplazamiento + serie.posicion,
      v_indice + 1,
      ((serie.posicion - 1) / v_columnas) + 1,
      ((serie.posicion - 1) % v_columnas) + 1,
      v_tipo
    from pg_catalog.generate_series(1, v_cantidad) as serie(posicion);

    v_desplazamiento := v_desplazamiento + v_cantidad;
  end loop;

  return to_jsonb(v_plantilla);
end;
$$;

-- 6. Permitir la llamada únicamente a sesiones autenticadas.
-- La función también comprueba el rol y la propiedad del bus.
revoke execute on function public.guardar_plantilla_asientos(
  uuid, jsonb, timestamptz
) from public, anon, authenticated;

grant execute on function public.guardar_plantilla_asientos(
  uuid, jsonb, timestamptz
) to authenticated;
-- =====================================================================
-- Cambio 3, parte 3.2: validaciones de los formularios en la base
--
-- Parte de la base en la nube (cambio3-2-base-nube.txt). Los conteos de
-- la nube dan 0 datos que no cumplan: las restricciones nuevas se
-- validan contra los datos existentes sin cambiar ninguno.
--
-- Qué cambia:
--   1. Cooperativas: disparador validar_cooperativa (antes de insertar o
--      editar) que limpia y revisa solo lo que cambia, con mensajes claros:
--        - nombre: de 3 a 120 caracteres (espacios sobrantes fuera);
--        - RUC: 13 dígitos, provincia 01-24 o 30, tercer dígito 0-6 o 9 y
--          establecimiento desde 001 (no se revisa el dígito verificador:
--          el SRI emite RUC de sociedades que no lo cumplen);
--        - dirección: de 5 a 200 caracteres;
--        - teléfono: celular 09xxxxxxxx o fijo 0[2-7]xxxxxxx, guardado
--          sin espacios, guiones ni paréntesis.
--      Más restricciones CHECK con las mismas reglas, por si algo escribe
--      en la tabla sin pasar por el disparador.
--   2. _preparar_pasajeros (compra del cliente y venta en ventanilla):
--      cédula ecuatoriana con dígito verificador (antes solo 10 dígitos) y
--      nombres y apellidos de 2 a 80 letras, sin espacios sobrantes.
--      crear_compra_cliente y vender_en_oficina no cambian (la llaman).
--   3. boletos: restricciones de cédula válida y nombres válidos.
--   4. rechazar_pago: motivo de 3 a 300 caracteres, sin espacios sobrantes.
--      compras: restricción con el mismo largo del motivo.
--   5. registrar_comprobante: el archivo debe estar en la carpeta
--      <cliente>/<compra>/, con extensión jpg, jpeg, png, webp o pdf, y
--      debe existir en el bucket "comprobantes" (tipo y tamaño ya los
--      limita el bucket: JPG, PNG, WebP o PDF y máximo 5 MB).
--
-- Requiere la migración 20261121090000 (texto_de_nombre_valido).
-- Se ejecuta en una sola transacción.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Comprobaciones previas
-- ---------------------------------------------------------------------
do $$
begin
    if to_regprocedure('public.cedula_ecuatoriana_valida(text)') is null
       or to_regprocedure('public.texto_de_nombre_valido(text)') is null then
        raise exception 'Falta la migración 20261121090000_registro_acceso_perfil. Aplícala primero.';
    end if;

    if to_regprocedure('public._preparar_pasajeros(uuid, jsonb)') is null
       or to_regprocedure('public.rechazar_pago(uuid, text)') is null
       or to_regprocedure('public.registrar_comprobante(uuid, text)') is null then
        raise exception 'Faltan funciones de compras (migración 20261104000100).';
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Cooperativas
-- ---------------------------------------------------------------------
create or replace function public.ruc_ecuatoriano_valido(p_ruc text)
returns boolean
language sql
immutable
set search_path to ''
as $function$
    select p_ruc is not null
       and p_ruc ~ '^[0-9]{13}$'
       and (substr(p_ruc, 1, 2)::int between 1 and 24 or substr(p_ruc, 1, 2) = '30')
       and substr(p_ruc, 3, 1) in ('0', '1', '2', '3', '4', '5', '6', '9')
       and right(p_ruc, 3) <> '000';
$function$;

-- Teléfono sin espacios, guiones, puntos ni paréntesis.
create or replace function public.limpiar_telefono(p_telefono text)
returns text
language sql
immutable
set search_path to ''
as $function$
    select pg_catalog.regexp_replace(coalesce(p_telefono, ''), '[\s\-().]', '', 'g');
$function$;

create or replace function public.telefono_contacto_valido(p_telefono text)
returns boolean
language sql
immutable
set search_path to ''
as $function$
    select public.limpiar_telefono(p_telefono) ~ '^(09[0-9]{8}|0[2-7][0-9]{7})$';
$function$;

create or replace function public.validar_cooperativa()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
    v_nueva boolean := tg_op = 'INSERT';
begin
    -- Solo se limpia y revisa lo que cambia (suspender o activar no revisa nada).
    if v_nueva or new.nombre is distinct from old.nombre then
        new.nombre := pg_catalog.regexp_replace(btrim(coalesce(new.nombre, '')), '\s+', ' ', 'g');

        if length(new.nombre) not between 3 and 120 then
            raise exception 'Escribe el nombre de la cooperativa (de 3 a 120 caracteres).' using errcode = '23514';
        end if;
    end if;

    if v_nueva or new.ruc is distinct from old.ruc then
        new.ruc := btrim(coalesce(new.ruc, ''));

        if new.ruc !~ '^[0-9]{13}$' then
            raise exception 'El RUC debe tener 13 dígitos, sin espacios ni guiones.' using errcode = '23514';
        end if;

        if not public.ruc_ecuatoriano_valido(new.ruc) then
            raise exception 'El RUC no es válido. Revisa la provincia, el tercer dígito y que termine en 001 o más.'
                using errcode = '23514';
        end if;
    end if;

    if v_nueva or new.direccion is distinct from old.direccion then
        new.direccion := pg_catalog.regexp_replace(btrim(coalesce(new.direccion, '')), '\s+', ' ', 'g');

        if length(new.direccion) not between 5 and 200 then
            raise exception 'Escribe la dirección (de 5 a 200 caracteres).' using errcode = '23514';
        end if;
    end if;

    if v_nueva or new.telefono is distinct from old.telefono then
        new.telefono := public.limpiar_telefono(new.telefono);

        if not public.telefono_contacto_valido(new.telefono) then
            raise exception 'Escribe un teléfono celular (09xxxxxxxx) o fijo con el código de provincia (02xxxxxxx).'
                using errcode = '23514';
        end if;
    end if;

    return new;
end;
$function$;

drop trigger if exists cooperativas_validar on public.cooperativas;
create trigger cooperativas_validar
    before insert or update on public.cooperativas
    for each row execute function public.validar_cooperativa();

-- Las mismas reglas como restricciones (respaldo del disparador).
-- Los datos actuales cumplen (conteos en 0), así que se validan ya.
alter table public.cooperativas drop constraint if exists cooperativas_nombre_largo_check;
alter table public.cooperativas
    add constraint cooperativas_nombre_largo_check
        check (length(btrim(nombre)) between 3 and 120);

alter table public.cooperativas drop constraint if exists cooperativas_ruc_valido_check;
alter table public.cooperativas
    add constraint cooperativas_ruc_valido_check
        check (public.ruc_ecuatoriano_valido(ruc));

alter table public.cooperativas drop constraint if exists cooperativas_direccion_largo_check;
alter table public.cooperativas
    add constraint cooperativas_direccion_largo_check
        check (length(btrim(direccion)) between 5 and 200);

alter table public.cooperativas drop constraint if exists cooperativas_telefono_valido_check;
alter table public.cooperativas
    add constraint cooperativas_telefono_valido_check
        check (public.telefono_contacto_valido(telefono));

-- ---------------------------------------------------------------------
-- 2. Pasajeros de la compra y de la venta en ventanilla
--    (versión de la nube + cédula con dígito verificador y nombres)
-- ---------------------------------------------------------------------
create or replace function public._preparar_pasajeros(p_viaje_id uuid, p_pasajeros jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_bus uuid;
  v_precio numeric(10,2);
  v_cantidad integer;
  v_indice integer;
  v_item jsonb;
  v_asiento integer;
  v_vistos integer[] := '{}';
  v_tipo text;
  v_descuento numeric;
  v_cedula text;
  v_nombres text;
  v_apellidos text;
  v_precio_pasajero numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_resultado jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_pasajeros) is distinct from 'array' then
    raise exception 'La lista de pasajeros no es válida.';
  end if;

  v_cantidad := jsonb_array_length(p_pasajeros);

  if v_cantidad < 1 or v_cantidad > 10 then
    raise exception 'Una compra debe tener entre 1 y 10 pasajeros.';
  end if;

  select v.bus_id, v.precio
    into v_bus, v_precio
  from public.viajes as v
  where v.id = p_viaje_id;

  for v_indice in 0..(v_cantidad - 1) loop
    v_item := p_pasajeros -> v_indice;

    if jsonb_typeof(v_item) is distinct from 'object'
       or jsonb_typeof(v_item -> 'numero_asiento') is distinct from 'number' then
      raise exception 'Los datos del pasajero % no son válidos.', v_indice + 1;
    end if;

    v_asiento := (v_item ->> 'numero_asiento')::numeric::integer;

    if v_asiento = any (v_vistos) then
      raise exception 'El asiento % está repetido.', v_asiento;
    end if;
    v_vistos := v_vistos || v_asiento;

    if not exists (
      select 1 from public.asientos as a
      where a.bus_id = v_bus and a.numero = v_asiento
    ) then
      raise exception 'El asiento % no existe en este bus.', v_asiento;
    end if;

    v_tipo := coalesce(nullif(trim(v_item ->> 'tipo'), ''), 'normal');

    select t.descuento into v_descuento
    from public.tipos_pasajero as t
    where t.codigo = v_tipo;

    if not found then
      raise exception 'El tipo de pasajero del asiento % no es válido.', v_asiento;
    end if;

    -- Cambio 3: espacios sobrantes fuera, cédula con dígito verificador y
    -- nombres de 2 a 80 letras (las mismas reglas del registro).
    v_cedula := btrim(coalesce(v_item ->> 'cedula', ''));
    v_nombres := pg_catalog.regexp_replace(btrim(coalesce(v_item ->> 'nombres', '')), '\s+', ' ', 'g');
    v_apellidos := pg_catalog.regexp_replace(btrim(coalesce(v_item ->> 'apellidos', '')), '\s+', ' ', 'g');

    if not public.cedula_ecuatoriana_valida(v_cedula) then
      raise exception 'La cédula del asiento % no es válida.', v_asiento using errcode = '23514';
    end if;

    if not public.texto_de_nombre_valido(v_nombres) then
      raise exception 'Revisa los nombres del asiento % (de 2 a 80 letras).', v_asiento using errcode = '23514';
    end if;

    if not public.texto_de_nombre_valido(v_apellidos) then
      raise exception 'Revisa los apellidos del asiento % (de 2 a 80 letras).', v_asiento using errcode = '23514';
    end if;

    v_precio_pasajero := round(v_precio * (100 - v_descuento) / 100, 2);
    v_subtotal := v_subtotal + v_precio;
    v_total := v_total + v_precio_pasajero;

    v_resultado := v_resultado || jsonb_build_array(
      jsonb_build_object(
        'numero_asiento', v_asiento,
        'cedula', v_cedula,
        'nombres', v_nombres,
        'apellidos', v_apellidos,
        'tipo', v_tipo,
        'precio', v_precio_pasajero
      )
    );
  end loop;

  return jsonb_build_object(
    'pasajeros', v_resultado,
    'subtotal', v_subtotal,
    'total', v_total
  );
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. Boletos: cédula y nombres válidos (los datos actuales cumplen)
-- ---------------------------------------------------------------------
alter table public.boletos drop constraint if exists boletos_cedula_valida_check;
alter table public.boletos
    add constraint boletos_cedula_valida_check
        check (public.cedula_ecuatoriana_valida(pasajero_cedula));

alter table public.boletos drop constraint if exists boletos_nombres_validos_check;
alter table public.boletos
    add constraint boletos_nombres_validos_check
        check (
            public.texto_de_nombre_valido(pg_catalog.regexp_replace(btrim(pasajero_nombres), '\s+', ' ', 'g'))
            and public.texto_de_nombre_valido(pg_catalog.regexp_replace(btrim(pasajero_apellidos), '\s+', ' ', 'g'))
        );

-- ---------------------------------------------------------------------
-- 4. Rechazar un pago: motivo de 3 a 300 caracteres
--    (versión de la nube + largo máximo y espacios sobrantes)
-- ---------------------------------------------------------------------
create or replace function public.rechazar_pago(p_compra_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_usuario uuid := auth.uid();
  v_cooperativa uuid;
  v_estado text;
  v_motivo text := pg_catalog.regexp_replace(btrim(coalesce(p_motivo, '')), '\s+', ' ', 'g');
begin
  if v_usuario is null or public.rol_actual() is distinct from 'oficinista' then
    raise exception 'Solo un oficinista puede rechazar pagos.' using errcode = '42501';
  end if;

  if length(v_motivo) < 3 then
    raise exception 'Escribe el motivo del rechazo (mínimo 3 caracteres).' using errcode = '23514';
  end if;

  if length(v_motivo) > 300 then
    raise exception 'El motivo del rechazo puede tener máximo 300 caracteres.' using errcode = '23514';
  end if;

  select c.cooperativa_id, c.estado
    into v_cooperativa, v_estado
  from public.compras as c
  where c.id = p_compra_id
  for update;

  if not found or not public.es_de_mi_cooperativa(v_cooperativa) then
    raise exception 'No se encontró la compra en tu cooperativa.' using errcode = '42501';
  end if;

  if v_estado <> 'pendiente_validacion' then
    raise exception 'La compra no está pendiente de validación (estado: %).', v_estado;
  end if;

  update public.compras
  set estado = 'rechazada',
      validado_por = v_usuario,
      validado_en = now(),
      motivo_rechazo = v_motivo
  where id = p_compra_id;

  update public.boletos
  set estado = 'anulado'
  where compra_id = p_compra_id
    and estado = 'reservado';

  return jsonb_build_object('compra_id', p_compra_id, 'estado', 'rechazada');
end;
$function$;

alter table public.compras drop constraint if exists compras_motivo_rechazo_check;
alter table public.compras
    add constraint compras_motivo_rechazo_check
        check (motivo_rechazo is null or length(btrim(motivo_rechazo)) between 3 and 300);

-- ---------------------------------------------------------------------
-- 5. Registrar el comprobante: carpeta de la compra, extensión permitida
--    y archivo subido de verdad (versión de la nube + esas revisiones)
-- ---------------------------------------------------------------------
create or replace function public.registrar_comprobante(p_compra_id uuid, p_ruta text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_usuario uuid := auth.uid();
  v_comprador uuid;
  v_estado text;
begin
  if v_usuario is null then
    raise exception 'Debes iniciar sesión.' using errcode = '42501';
  end if;

  perform public.expirar_compras_vencidas();

  select c.comprador_id, c.estado
    into v_comprador, v_estado
  from public.compras as c
  where c.id = p_compra_id
  for update;

  if not found or v_comprador is distinct from v_usuario then
    raise exception 'No se encontró la compra.' using errcode = '42501';
  end if;

  if v_estado = 'vencida' then
    raise exception 'Pasaron las 3 horas para subir el comprobante. La reserva se canceló.';
  end if;

  if v_estado <> 'pendiente_comprobante' then
    raise exception 'Esta compra ya no admite comprobante (estado: %).', v_estado;
  end if;

  -- Carpeta <cliente>/<compra>/ y extensión permitida (lo que arma pago.js).
  if p_ruta is null
     or p_ruta not like v_usuario::text || '/' || p_compra_id::text || '/%'
     or p_ruta ~ '\.\.'
     or p_ruta !~* '\.(jpe?g|png|webp|pdf)$' then
    raise exception 'El comprobante debe ser una imagen JPG, PNG o WebP, o un PDF.' using errcode = '23514';
  end if;

  -- El archivo tiene que estar subido en el bucket (tipo y tamaño los limita el bucket).
  if not exists (
    select 1
    from storage.objects as o
    where o.bucket_id = 'comprobantes'
      and o.name = p_ruta
  ) then
    raise exception 'No se encontró el archivo del comprobante. Vuelve a subirlo.' using errcode = '23514';
  end if;

  update public.compras
  set comprobante_ruta = p_ruta,
      comprobante_subido_en = now(),
      estado = 'pendiente_validacion',
      vence_en = null
  where id = p_compra_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- 6. Permisos: create or replace conserva los que ya tenían
--    _preparar_pasajeros, rechazar_pago y registrar_comprobante.
--    Las funciones nuevas de reglas solo revisan textos.
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;

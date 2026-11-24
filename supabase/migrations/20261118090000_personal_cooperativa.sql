-- =====================================================================
-- Cambio 6, parte 4: personal de la cooperativa
--
-- Qué cambia:
--   1. cooperativas_usuarios guarda los datos del trabajo de cada persona
--      en la cooperativa:
--        - ubicacion_oficina: oficinistas (ej. "Terminal de Ambato, ventanilla 12").
--          Obligatoria para los oficinistas nuevos; los que ya existían
--          pueden quedar sin ella y el gerente la completa después.
--        - funcion_bus: usuarios bus: 'chofer', 'controlador' o 'dueno'.
--   2. asignar_usuario_a_cooperativa (versión de la nube + cambios):
--        - el gerente puede asignar 'oficinista' o 'bus' (antes solo
--          'oficinista') a SU cooperativa, con las mismas protecciones
--          (solo cuentas nuevas de cliente);
--        - recibe la ubicación (oficinista) o la función (bus) y las exige;
--        - para un usuario bus revisa en la base la cédula ecuatoriana, los
--          nombres, los apellidos y el teléfono (opcional, 09xxxxxxxx).
--   3. obtener_oficinistas_de_cooperativa devuelve también teléfono y
--      ubicación. Nueva actualizar_ubicacion_oficinista.
--   4. Usuarios bus: obtener_usuarios_bus_de_cooperativa (ahora con
--      teléfono, función y buses asignados), actualizar_usuario_bus,
--      cambiar_estado_usuario_bus y quitar_usuario_bus (no se puede quitar
--      si está asignado a un bus; el mensaje dice a cuál).
-- Parte de la base en la nube (cambio6-base-nube.txt).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Datos del trabajo en la cooperativa
-- ---------------------------------------------------------------------
alter table public.cooperativas_usuarios
    add column if not exists ubicacion_oficina varchar(120),
    add column if not exists funcion_bus varchar(20);

alter table public.cooperativas_usuarios drop constraint if exists cooperativas_usuarios_ubicacion_check;
alter table public.cooperativas_usuarios
    add constraint cooperativas_usuarios_ubicacion_check
        check (ubicacion_oficina is null
               or (ubicacion_oficina = btrim(ubicacion_oficina) and length(ubicacion_oficina) between 3 and 120));

alter table public.cooperativas_usuarios drop constraint if exists cooperativas_usuarios_funcion_bus_check;
alter table public.cooperativas_usuarios
    add constraint cooperativas_usuarios_funcion_bus_check
        check (funcion_bus is null or funcion_bus in ('chofer', 'controlador', 'dueno'));

-- ---------------------------------------------------------------------
-- 2. Reglas de datos de una persona (las mismas del registro)
-- ---------------------------------------------------------------------
-- Cédula ecuatoriana: 10 dígitos, provincia 01-24 o 30, tercer dígito
-- menor que 6 y dígito verificador (módulo 10).
create or replace function public.cedula_ecuatoriana_valida(p_cedula text)
returns boolean
language plpgsql
immutable
set search_path to ''
as $function$
declare
    v_suma int := 0;
    v_digito int;
    v_provincia int;
begin
    if p_cedula is null or p_cedula !~ '^[0-9]{10}$' then
        return false;
    end if;

    v_provincia := substr(p_cedula, 1, 2)::int;

    if (v_provincia not between 1 and 24 and v_provincia <> 30)
       or substr(p_cedula, 3, 1)::int > 5 then
        return false;
    end if;

    for i in 1..9 loop
        v_digito := substr(p_cedula, i, 1)::int * case when i % 2 = 1 then 2 else 1 end;
        if v_digito > 9 then
            v_digito := v_digito - 9;
        end if;
        v_suma := v_suma + v_digito;
    end loop;

    return (10 - v_suma % 10) % 10 = substr(p_cedula, 10, 1)::int;
end;
$function$;

-- Revisa cédula, nombres, apellidos y teléfono (opcional). Lanza el error.
create or replace function public.exigir_datos_de_persona(
    p_cedula text,
    p_nombres text,
    p_apellidos text,
    p_telefono text
)
returns void
language plpgsql
immutable
set search_path to ''
as $function$
begin
    if not public.cedula_ecuatoriana_valida(p_cedula) then
        raise exception 'La cédula ingresada no es válida.' using errcode = '23514';
    end if;

    if length(btrim(coalesce(p_nombres, ''))) < 2 or length(btrim(coalesce(p_apellidos, ''))) < 2 then
        raise exception 'Ingresa los nombres y apellidos completos.' using errcode = '23514';
    end if;

    if p_telefono is not null and p_telefono !~ '^09[0-9]{8}$' then
        raise exception 'El teléfono debe tener 10 dígitos y empezar con 09.' using errcode = '23514';
    end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. Asignar una cuenta nueva a la cooperativa (oficinista o usuario bus)
--    Antes: (p_usuario_id, p_cooperativa_id, p_rol). Las llamadas con esos
--    tres datos siguen funcionando para los demás roles.
-- ---------------------------------------------------------------------
drop function if exists public.asignar_usuario_a_cooperativa(uuid, uuid, text);

create or replace function public.asignar_usuario_a_cooperativa(
    p_usuario_id uuid,
    p_cooperativa_id uuid,
    p_rol text,
    p_ubicacion_oficina text default null,
    p_funcion_bus text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_llamador text := public.rol_actual();
    v_perfil public.perfiles%rowtype;
    v_ubicacion text := pg_catalog.regexp_replace(btrim(coalesce(p_ubicacion_oficina, '')), '\s+', ' ', 'g');
    v_funcion text := nullif(lower(btrim(coalesce(p_funcion_bus, ''))), '');
begin
    if v_llamador is null or v_llamador not in ('administrador', 'cooperativa') then
        raise exception 'No tienes permiso para asignar personal.'
            using errcode = '42501';
    end if;

    if p_rol is null or p_rol not in ('oficinista', 'cooperativa', 'bus') then
        raise exception 'Rol no válido.' using errcode = '22023';
    end if;

    select p.* into v_perfil
    from public.perfiles as p
    where p.id = p_usuario_id;

    if not found then
        raise exception 'El usuario no existe.' using errcode = '22023';
    end if;

    if v_llamador = 'cooperativa' then
        if p_rol not in ('oficinista', 'bus')
           or not public.es_de_mi_cooperativa(p_cooperativa_id) then
            raise exception 'Solo puedes asignar oficinistas o usuarios bus a tu cooperativa.'
                using errcode = '42501';
        end if;

        if v_perfil.rol is distinct from 'cliente' then
            raise exception 'Este usuario ya tiene otro rol y no se puede reasignar.'
                using errcode = '42501';
        end if;
    end if;

    if p_rol = 'oficinista' and length(v_ubicacion) not between 3 and 120 then
        raise exception 'Escribe la ubicación de la oficina (de 3 a 120 caracteres).'
            using errcode = '23514';
    end if;

    if p_rol = 'bus' then
        if v_funcion is null or v_funcion not in ('chofer', 'controlador', 'dueno') then
            raise exception 'Elige la función del usuario bus: chofer, controlador o dueño.'
                using errcode = '23514';
        end if;

        perform public.exigir_datos_de_persona(
            v_perfil.cedula, v_perfil.nombres, v_perfil.apellidos, nullif(btrim(coalesce(v_perfil.telefono, '')), '')
        );
    end if;

    update public.perfiles
    set rol = p_rol
    where id = p_usuario_id;

    insert into public.cooperativas_usuarios (cooperativa_id, perfil_id, ubicacion_oficina, funcion_bus)
    values (
        p_cooperativa_id,
        p_usuario_id,
        case when p_rol = 'oficinista' then v_ubicacion end,
        case when p_rol = 'bus' then v_funcion end
    );
end;
$function$;

revoke all on function public.asignar_usuario_a_cooperativa(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.asignar_usuario_a_cooperativa(uuid, uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Oficinistas: lista con ubicación y edición de la ubicación
-- ---------------------------------------------------------------------
drop function if exists public.obtener_oficinistas_de_cooperativa(uuid);

create or replace function public.obtener_oficinistas_de_cooperativa(p_cooperativa_id uuid)
returns table (
    id uuid, nombres text, apellidos text, cedula text, estado text,
    telefono text, ubicacion_oficina text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
    if public.rol_actual() is distinct from 'administrador'
       and not (
           public.rol_actual() = 'cooperativa'
           and public.es_de_mi_cooperativa(p_cooperativa_id)
       ) then
        raise exception 'No tienes permiso para ver este personal.'
            using errcode = '42501';
    end if;

    return query
    select p.id, p.nombres::text, p.apellidos::text, p.cedula::text, p.estado::text,
           p.telefono::text, cu.ubicacion_oficina::text
    from public.perfiles as p
    join public.cooperativas_usuarios as cu on cu.perfil_id = p.id
    where cu.cooperativa_id = p_cooperativa_id
      and p.rol = 'oficinista'
    order by p.apellidos, p.nombres;
end;
$function$;

create or replace function public.actualizar_ubicacion_oficinista(p_perfil_id uuid, p_ubicacion text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_ubicacion text := pg_catalog.regexp_replace(btrim(coalesce(p_ubicacion, '')), '\s+', ' ', 'g');
begin
    if length(v_ubicacion) not between 3 and 120 then
        raise exception 'Escribe la ubicación de la oficina (de 3 a 120 caracteres).'
            using errcode = '23514';
    end if;

    update public.cooperativas_usuarios as cu
    set ubicacion_oficina = v_ubicacion
    from public.perfiles as p
    where cu.perfil_id = p_perfil_id
      and p.id = cu.perfil_id
      and p.rol = 'oficinista'
      and (
          public.rol_actual() = 'administrador'
          or (public.rol_actual() = 'cooperativa' and public.es_de_mi_cooperativa(cu.cooperativa_id))
      );

    if not found then
        raise exception 'No se encontró ese oficinista en tu cooperativa.'
            using errcode = '42501';
    end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. Usuarios bus
-- ---------------------------------------------------------------------
-- ¿Puede el usuario actual gestionar a este usuario bus? Devuelve su cooperativa.
create or replace function public.cooperativa_de_usuario_bus(p_perfil_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    v_cooperativa uuid;
begin
    select cu.cooperativa_id into v_cooperativa
    from public.cooperativas_usuarios as cu
    join public.perfiles as p on p.id = cu.perfil_id
    where cu.perfil_id = p_perfil_id
      and p.rol = 'bus'
      and (
          public.rol_actual() = 'administrador'
          or (public.rol_actual() = 'cooperativa' and public.es_de_mi_cooperativa(cu.cooperativa_id))
      )
    limit 1;

    if v_cooperativa is null then
        raise exception 'No se encontró ese usuario bus en tu cooperativa.'
            using errcode = '42501';
    end if;

    return v_cooperativa;
end;
$function$;

-- Lista (también la usa el combo "Usuario bus asignado" de buses).
drop function if exists public.obtener_usuarios_bus_de_cooperativa(uuid);

create or replace function public.obtener_usuarios_bus_de_cooperativa(p_cooperativa_id uuid)
returns table (
    id uuid, nombres text, apellidos text, cedula text, estado text,
    telefono text, funcion_bus text, buses_asignados text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
    if public.rol_actual() is distinct from 'administrador'
       and not (
           public.rol_actual() = 'cooperativa'
           and public.es_de_mi_cooperativa(p_cooperativa_id)
       ) then
        raise exception 'No tienes permiso para ver este personal.'
            using errcode = '42501';
    end if;

    return query
    select p.id, p.nombres::text, p.apellidos::text, p.cedula::text, p.estado::text,
           p.telefono::text, cu.funcion_bus::text,
           (select string_agg(b.numero_interno || ' (' || b.placa || ')', ', ' order by b.numero_interno)
            from public.buses as b
            where b.usuario_bus_id = p.id)
    from public.perfiles as p
    join public.cooperativas_usuarios as cu on cu.perfil_id = p.id
    where cu.cooperativa_id = p_cooperativa_id
      and p.rol = 'bus'
    order by p.apellidos, p.nombres;
end;
$function$;

-- Editar los datos (el correo y la contraseña son de la cuenta y no se cambian aquí).
create or replace function public.actualizar_usuario_bus(
    p_perfil_id uuid,
    p_cedula text,
    p_nombres text,
    p_apellidos text,
    p_telefono text,
    p_funcion_bus text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_cooperativa uuid := public.cooperativa_de_usuario_bus(p_perfil_id);
    v_cedula text := btrim(coalesce(p_cedula, ''));
    v_nombres text := pg_catalog.regexp_replace(btrim(coalesce(p_nombres, '')), '\s+', ' ', 'g');
    v_apellidos text := pg_catalog.regexp_replace(btrim(coalesce(p_apellidos, '')), '\s+', ' ', 'g');
    v_telefono text := nullif(btrim(coalesce(p_telefono, '')), '');
    v_funcion text := nullif(lower(btrim(coalesce(p_funcion_bus, ''))), '');
begin
    perform public.exigir_datos_de_persona(v_cedula, v_nombres, v_apellidos, v_telefono);

    if v_funcion is null or v_funcion not in ('chofer', 'controlador', 'dueno') then
        raise exception 'Elige la función del usuario bus: chofer, controlador o dueño.'
            using errcode = '23514';
    end if;

    update public.perfiles
    set cedula = v_cedula,
        nombres = v_nombres,
        apellidos = v_apellidos,
        telefono = v_telefono
    where id = p_perfil_id;

    update public.cooperativas_usuarios
    set funcion_bus = v_funcion
    where perfil_id = p_perfil_id
      and cooperativa_id = v_cooperativa;
exception
    when unique_violation then
        raise exception 'Ya existe otra cuenta con la cédula %.', v_cedula
            using errcode = '23505';
end;
$function$;

create or replace function public.cambiar_estado_usuario_bus(p_perfil_id uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
    if p_estado is null or p_estado not in ('activo', 'suspendido') then
        raise exception 'Estado no válido.' using errcode = '22023';
    end if;

    perform public.cooperativa_de_usuario_bus(p_perfil_id);

    update public.perfiles
    set estado = p_estado
    where id = p_perfil_id
      and rol = 'bus';
end;
$function$;

-- Quitar de la cooperativa (como quitar_oficinista: se quita la asignación).
-- No se puede si está asignado a algún bus.
create or replace function public.quitar_usuario_bus(p_perfil_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_cooperativa uuid := public.cooperativa_de_usuario_bus(p_perfil_id);
    v_buses text;
begin
    select string_agg(b.numero_interno || ' (' || b.placa || ')', ', ' order by b.numero_interno)
      into v_buses
    from public.buses as b
    where b.usuario_bus_id = p_perfil_id;

    if v_buses is not null then
        raise exception 'No se puede quitar porque está asignado al bus %. Primero cámbialo en Gestión de buses.', v_buses
            using errcode = '23503';
    end if;

    delete from public.cooperativas_usuarios as cu
    where cu.perfil_id = p_perfil_id
      and cu.cooperativa_id = v_cooperativa;
end;
$function$;

-- Permisos
do $$
declare
    v_funcion text;
begin
    foreach v_funcion in array array[
        'public.obtener_oficinistas_de_cooperativa(uuid)',
        'public.actualizar_ubicacion_oficinista(uuid, text)',
        'public.obtener_usuarios_bus_de_cooperativa(uuid)',
        'public.actualizar_usuario_bus(uuid, text, text, text, text, text)',
        'public.cambiar_estado_usuario_bus(uuid, text)',
        'public.quitar_usuario_bus(uuid)',
        'public.cooperativa_de_usuario_bus(uuid)'
    ]
    loop
        execute format('revoke all on function %s from public, anon', v_funcion);
        execute format('grant execute on function %s to authenticated', v_funcion);
    end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;

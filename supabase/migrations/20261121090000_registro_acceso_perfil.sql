-- =====================================================================
-- Cambio 3, parte 3.1: registro, acceso y perfil
--
-- Parte de la base en la nube (cambio3-base-nube.txt).
--
-- Qué cambia:
--   1. perfiles: fecha de nacimiento y fecha de aceptación de los términos.
--      Disparador validar_perfil (antes de insertar o editar): cédula
--      ecuatoriana, nombres y apellidos (2 a 80 letras), teléfono opcional
--      09xxxxxxxx y fecha de nacimiento (mayor de 18 años, fecha de Ecuador).
--      Solo revisa lo que cambia, así los perfiles antiguos con datos mal
--      escritos se pueden seguir actualizando (rol, estado) hasta que su
--      dueño los corrija desde su perfil.
--   2. crear_perfil_al_registrar: exige los datos anteriores y, en el
--      registro del cliente, la aceptación de los términos. Las cuentas del
--      personal (origen 'personal') no aceptan términos al crearse.
--   3. rol_actual(): una cuenta suspendida no tiene rol (no puede usar nada).
--   4. Seguridad:
--        - se elimina "lectura de perfiles para autenticados" (cualquiera
--          leía cédula y teléfono de todos). Cada uno ve su perfil, el
--          gerente ve a su personal y el administrador ve todo;
--        - se elimina la política de storage "personal ve comprobantes"
--          ("ver comprobantes autorizados" ya cubre lo correcto);
--        - el rol anon pierde todos sus permisos sobre perfiles.
--   5. Funciones nuevas:
--        - actualizar_mi_perfil: el usuario edita sus datos (la cédula solo
--          si la guardada no es válida). El rol nunca cambia aquí.
--        - nombres_de_mi_ultimo_boleto: nombres del boleto más reciente de
--          la cédula de la PROPIA cuenta (con sesión, nunca de otra cédula).
--        - cedula_registrada: para el administrador y el gerente, antes de
--          crear una cuenta del personal.
--        - asignar_cuenta_existente: el gerente asigna a su cooperativa una
--          cuenta de cliente ya creada (cédula y correo deben coincidir).
--   6. quitar_oficinista y quitar_usuario_bus: además de quitar la
--      asignación, la cuenta vuelve a ser 'cliente' y queda activa, así
--      otra cooperativa puede asignarla con "Asignar una cuenta existente".
--
-- Se ejecuta en una sola transacción.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Comprobaciones previas
-- ---------------------------------------------------------------------
do $$
begin
    if to_regprocedure('public.cedula_ecuatoriana_valida(text)') is null
       or to_regprocedure('public.es_de_mi_cooperativa(uuid)') is null
       or to_regprocedure('public.cooperativa_de_usuario_bus(uuid)') is null
       or to_regprocedure('public.asignar_usuario_a_cooperativa(uuid, uuid, text, text, text)') is null then
        raise exception 'Faltan migraciones anteriores (cambio 6). Aplícalas primero.';
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'perfiles' and column_name = 'estado'
    ) then
        raise exception 'Falta la columna perfiles.estado.';
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas de perfiles
-- ---------------------------------------------------------------------
alter table public.perfiles
    add column if not exists fecha_nacimiento date,
    add column if not exists terminos_aceptados_en timestamptz;

alter table public.perfiles drop constraint if exists perfiles_fecha_nacimiento_check;
alter table public.perfiles
    add constraint perfiles_fecha_nacimiento_check
        check (fecha_nacimiento is null or fecha_nacimiento >= date '1900-01-01');

-- Fecha de hoy en Ecuador y edad cumplida a esa fecha.
create or replace function public.fecha_hoy_ecuador()
returns date
language sql
stable
set search_path to ''
as $function$
    select (pg_catalog.now() at time zone 'America/Guayaquil')::date;
$function$;

create or replace function public.edad_cumplida(p_fecha_nacimiento date)
returns integer
language sql
stable
set search_path to ''
as $function$
    select case
        when p_fecha_nacimiento is null then null
        else extract(year from pg_catalog.age(public.fecha_hoy_ecuador(), p_fecha_nacimiento))::integer
    end;
$function$;

-- Nombres o apellidos: 2 a 80 caracteres, solo letras, espacios, apóstrofo, punto y guion.
create or replace function public.texto_de_nombre_valido(p_texto text)
returns boolean
language sql
immutable
set search_path to ''
as $function$
    select p_texto is not null
       and length(p_texto) between 2 and 80
       and p_texto ~ '^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'' .-]+$'
       and p_texto ~ '[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]';
$function$;

-- ---------------------------------------------------------------------
-- 2. Disparador: reglas de los datos de una persona
-- ---------------------------------------------------------------------
create or replace function public.validar_perfil()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
    v_nuevo boolean := tg_op = 'INSERT';
    v_edad integer;
begin
    -- Solo se limpia y revisa lo que cambia (los datos antiguos no bloquean
    -- otros cambios, como el rol o el estado).
    if v_nuevo or new.cedula is distinct from old.cedula then
        new.cedula := btrim(coalesce(new.cedula, ''));

        if not public.cedula_ecuatoriana_valida(new.cedula) then
            raise exception 'La cédula ingresada no es válida.' using errcode = '23514';
        end if;
    end if;

    if v_nuevo or new.nombres is distinct from old.nombres then
        new.nombres := pg_catalog.regexp_replace(btrim(coalesce(new.nombres, '')), '\s+', ' ', 'g');

        if not public.texto_de_nombre_valido(new.nombres) then
            raise exception 'Escribe los nombres (de 2 a 80 letras).' using errcode = '23514';
        end if;
    end if;

    if v_nuevo or new.apellidos is distinct from old.apellidos then
        new.apellidos := pg_catalog.regexp_replace(btrim(coalesce(new.apellidos, '')), '\s+', ' ', 'g');

        if not public.texto_de_nombre_valido(new.apellidos) then
            raise exception 'Escribe los apellidos (de 2 a 80 letras).' using errcode = '23514';
        end if;
    end if;

    if v_nuevo or new.telefono is distinct from old.telefono then
        new.telefono := nullif(btrim(coalesce(new.telefono, '')), '');

        if new.telefono is not null and new.telefono !~ '^09[0-9]{8}$' then
            raise exception 'El teléfono debe tener 10 dígitos y empezar con 09.' using errcode = '23514';
        end if;
    end if;

    if v_nuevo or new.fecha_nacimiento is distinct from old.fecha_nacimiento then
        if new.fecha_nacimiento is null then
            raise exception 'La fecha de nacimiento es obligatoria.' using errcode = '23514';
        end if;

        if new.fecha_nacimiento > public.fecha_hoy_ecuador() then
            raise exception 'La fecha de nacimiento no puede ser futura.' using errcode = '23514';
        end if;

        v_edad := public.edad_cumplida(new.fecha_nacimiento);

        if v_edad < 18 then
            raise exception 'Debes ser mayor de 18 años para tener una cuenta. Los menores viajan como acompañantes.'
                using errcode = '23514';
        end if;

        if v_edad > 120 then
            raise exception 'Revisa la fecha de nacimiento.' using errcode = '23514';
        end if;
    end if;

    return new;
end;
$function$;

drop trigger if exists perfiles_validar on public.perfiles;
create trigger perfiles_validar
    before insert or update on public.perfiles
    for each row execute function public.validar_perfil();

-- ---------------------------------------------------------------------
-- 3. Crear el perfil al registrarse (versión de la nube + reglas)
--    Datos que envía la app en options.data del signUp:
--      cedula, nombres, apellidos, telefono, fecha_nacimiento (AAAA-MM-DD),
--      acepta_terminos (true) y origen ('registro' o 'personal').
--    Si algo no es válido, Supabase responde "Database error saving new
--    user"; por eso la app revisa todo antes de llamar a signUp.
-- ---------------------------------------------------------------------
create or replace function public.crear_perfil_al_registrar()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_datos jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
    v_fecha date;
    v_personal boolean := (v_datos ->> 'origen') = 'personal';
    v_acepta boolean := lower(coalesce(v_datos ->> 'acepta_terminos', '')) = 'true';
begin
    begin
        v_fecha := nullif(btrim(coalesce(v_datos ->> 'fecha_nacimiento', '')), '')::date;
    exception when others then
        raise exception 'La fecha de nacimiento no es válida.' using errcode = '23514';
    end;

    if not v_personal and not v_acepta then
        raise exception 'Debes aceptar los Términos de uso y la Política de privacidad.' using errcode = '23514';
    end if;

    insert into public.perfiles (id, cedula, nombres, apellidos, telefono, fecha_nacimiento, terminos_aceptados_en, rol)
    values (
        new.id,
        v_datos ->> 'cedula',
        v_datos ->> 'nombres',
        v_datos ->> 'apellidos',
        v_datos ->> 'telefono',
        v_fecha,
        case when v_acepta then pg_catalog.now() end,
        'cliente'
    );

    return new;
exception
    when unique_violation then
        raise exception 'Esta cédula ya está registrada en otra cuenta.' using errcode = '23505';
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. Rol actual: una cuenta suspendida no tiene rol
-- ---------------------------------------------------------------------
create or replace function public.rol_actual()
returns text
language sql
stable
security definer
set search_path to ''
as $function$
    select p.rol
    from public.perfiles as p
    where p.id = auth.uid()
      and p.estado = 'activo';
$function$;

-- ---------------------------------------------------------------------
-- 5. Quién puede leer perfiles
-- ---------------------------------------------------------------------
-- ¿Este perfil es del personal de la cooperativa del gerente actual?
create or replace function public.es_personal_de_mi_cooperativa(p_perfil_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
    select public.rol_actual() = 'cooperativa'
       and exists (
           select 1
           from public.cooperativas_usuarios as cu
           where cu.perfil_id = p_perfil_id
             and public.es_de_mi_cooperativa(cu.cooperativa_id)
       );
$function$;

drop policy if exists "lectura de perfiles para autenticados" on public.perfiles;
drop policy if exists "usuario ve su perfil" on public.perfiles;
drop policy if exists "administrador ve todos" on public.perfiles;
drop policy if exists "gerente ve su personal" on public.perfiles;

create policy "usuario ve su perfil"
    on public.perfiles for select
    to authenticated
    using ((select auth.uid()) = id);

create policy "administrador ve todos"
    on public.perfiles for select
    to authenticated
    using ((select public.rol_actual()) = 'administrador');

create policy "gerente ve su personal"
    on public.perfiles for select
    to authenticated
    using (public.es_personal_de_mi_cooperativa(id));

-- El rol anon no necesita nada sobre perfiles.
revoke all on table public.perfiles from anon;

-- Comprobantes: "ver comprobantes autorizados" ya permite al dueño y al
-- oficinista de la cooperativa de esa compra.
drop policy if exists "personal ve comprobantes" on storage.objects;

-- ---------------------------------------------------------------------
-- 6. El usuario edita su perfil
-- ---------------------------------------------------------------------
create or replace function public.actualizar_mi_perfil(
    p_cedula text,
    p_nombres text,
    p_apellidos text,
    p_telefono text,
    p_fecha_nacimiento date
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
    v_perfil public.perfiles%rowtype;
    v_cedula text := btrim(coalesce(p_cedula, ''));
begin
    if auth.uid() is null then
        raise exception 'Inicia sesión para editar tu perfil.' using errcode = '42501';
    end if;

    select p.* into v_perfil
    from public.perfiles as p
    where p.id = auth.uid();

    if not found then
        raise exception 'No se encontró tu perfil.' using errcode = '42501';
    end if;

    if v_perfil.estado is distinct from 'activo' then
        raise exception 'Tu cuenta está suspendida.' using errcode = '42501';
    end if;

    -- La cédula solo se corrige si la guardada no es válida.
    if public.cedula_ecuatoriana_valida(v_perfil.cedula) then
        v_cedula := v_perfil.cedula;
    end if;

    update public.perfiles
    set cedula = v_cedula,
        nombres = p_nombres,
        apellidos = p_apellidos,
        telefono = p_telefono,
        fecha_nacimiento = p_fecha_nacimiento
    where id = auth.uid();
exception
    when unique_violation then
        raise exception 'Esta cédula ya está registrada en otra cuenta.' using errcode = '23505';
end;
$function$;

-- Nombres del boleto más reciente de la cédula de la propia cuenta.
-- Devuelve null si la cédula no es la de la cuenta o no tiene boletos.
create or replace function public.nombres_de_mi_ultimo_boleto(p_cedula text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    v_mia text;
    v_resultado jsonb;
begin
    if auth.uid() is null then
        raise exception 'Inicia sesión.' using errcode = '42501';
    end if;

    select p.cedula into v_mia
    from public.perfiles as p
    where p.id = auth.uid();

    if v_mia is null or btrim(coalesce(p_cedula, '')) <> v_mia then
        return null;
    end if;

    select jsonb_build_object('nombres', b.pasajero_nombres, 'apellidos', b.pasajero_apellidos)
      into v_resultado
    from public.boletos as b
    where b.pasajero_cedula = v_mia
    order by b.creado_en desc
    limit 1;

    return v_resultado;
end;
$function$;

-- ---------------------------------------------------------------------
-- 7. Personal: cédula ya registrada y asignar una cuenta existente
-- ---------------------------------------------------------------------
create or replace function public.cedula_registrada(p_cedula text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
    if public.rol_actual() is null or public.rol_actual() not in ('administrador', 'cooperativa') then
        raise exception 'No tienes permiso para esta consulta.' using errcode = '42501';
    end if;

    return exists (select 1 from public.perfiles as p where p.cedula = btrim(coalesce(p_cedula, '')));
end;
$function$;

create or replace function public.asignar_cuenta_existente(
    p_cedula text,
    p_correo text,
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
    v_id uuid;
    v_rol text;
    v_estado text;
    v_fecha date;
    v_confirmado timestamptz;
begin
    if public.rol_actual() is null or public.rol_actual() not in ('administrador', 'cooperativa') then
        raise exception 'No tienes permiso para asignar personal.' using errcode = '42501';
    end if;

    select p.id, p.rol, p.estado, p.fecha_nacimiento, u.email_confirmed_at
      into v_id, v_rol, v_estado, v_fecha, v_confirmado
    from public.perfiles as p
    join auth.users as u on u.id = p.id
    where p.cedula = btrim(coalesce(p_cedula, ''))
      and lower(u.email) = lower(btrim(coalesce(p_correo, '')));

    -- Mismo mensaje si no existe o si ya es del personal: no revela cuentas ajenas.
    if v_id is null or v_rol is distinct from 'cliente' then
        raise exception 'No hay una cuenta de cliente con esa cédula y ese correo.' using errcode = '22023';
    end if;

    if v_estado is distinct from 'activo' then
        raise exception 'Esa cuenta está suspendida.' using errcode = '22023';
    end if;

    if v_confirmado is null then
        raise exception 'Esa cuenta todavía no verificó su correo. Pídele que ingrese el código que le llegó.'
            using errcode = '22023';
    end if;

    if v_fecha is null or public.edad_cumplida(v_fecha) < 18 then
        raise exception 'La persona debe completar su fecha de nacimiento en "Mi perfil" (mayor de 18 años).'
            using errcode = '23514';
    end if;

    perform public.asignar_usuario_a_cooperativa(
        v_id, p_cooperativa_id, p_rol, p_ubicacion_oficina, p_funcion_bus
    );
end;
$function$;

-- ---------------------------------------------------------------------
-- 8. Quitar personal: la cuenta vuelve a ser cliente (versión de la nube + cambio)
-- ---------------------------------------------------------------------
create or replace function public.quitar_oficinista(p_perfil_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
    delete from public.cooperativas_usuarios as cu
    using public.perfiles as p
    where cu.perfil_id = p_perfil_id
      and p.id = cu.perfil_id
      and p.rol = 'oficinista'
      and (
          public.rol_actual() = 'administrador'
          or (
              public.rol_actual() = 'cooperativa'
              and public.es_de_mi_cooperativa(cu.cooperativa_id)
          )
      );

    if not found then
        raise exception 'No se encontró ese oficinista en tu cooperativa.'
            using errcode = '42501';
    end if;

    update public.perfiles as p
    set rol = 'cliente',
        estado = 'activo'
    where p.id = p_perfil_id
      and not exists (select 1 from public.cooperativas_usuarios as cu where cu.perfil_id = p_perfil_id);
end;
$function$;

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

    update public.perfiles as p
    set rol = 'cliente',
        estado = 'activo'
    where p.id = p_perfil_id
      and not exists (select 1 from public.cooperativas_usuarios as cu where cu.perfil_id = p_perfil_id);
end;
$function$;

-- Cuentas del personal que ya quedaron sin cooperativa (hoy 0 en la nube).
update public.perfiles as p
set rol = 'cliente',
    estado = 'activo'
where p.rol in ('oficinista', 'bus')
  and not exists (select 1 from public.cooperativas_usuarios as cu where cu.perfil_id = p.id);

-- ---------------------------------------------------------------------
-- 9. Permisos de las funciones
-- ---------------------------------------------------------------------
do $$
declare
    v_funcion text;
begin
    foreach v_funcion in array array[
        'public.actualizar_mi_perfil(text, text, text, text, date)',
        'public.nombres_de_mi_ultimo_boleto(text)',
        'public.cedula_registrada(text)',
        'public.asignar_cuenta_existente(text, text, uuid, text, text, text)',
        'public.quitar_oficinista(uuid)',
        'public.quitar_usuario_bus(uuid)',
        'public.es_personal_de_mi_cooperativa(uuid)'
    ]
    loop
        execute format('revoke all on function %s from public, anon', v_funcion);
        execute format('grant execute on function %s to authenticated', v_funcion);
    end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;

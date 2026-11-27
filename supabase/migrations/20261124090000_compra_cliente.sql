-- =====================================================================
-- Cambio 4, parte 4.2: compra del cliente
--
-- Parte de la base en la nube (cambio4-base-nube.txt) con la migración
-- 20261123090000_operacion_oficina.sql aplicada. No crea tablas ni cambia
-- funciones existentes: la compra sigue usando crear_compra_cliente
-- (origen APP por defecto, de 1 a 10 pasajeros, tarifa activa por asiento)
-- y el boleto usa el código único que ya existe (boletos.codigo).
--
-- Qué agrega:
--   1. pasajero_de_mis_compras(cédula): autocompleta nombres y apellidos de
--      un acompañante SOLO con los boletos de las compras de la propia
--      cuenta (comprador_id = auth.uid()). Si la cédula es la del perfil,
--      devuelve los nombres del perfil. No revela datos de otras cuentas:
--      si la cédula no aparece en tus compras devuelve null.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Comprobaciones previas
-- ---------------------------------------------------------------------
do $$
begin
    if to_regprocedure('public.rol_actual()') is null then
        raise exception 'Falta la función public.rol_actual(). Aplica las migraciones anteriores.';
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'compras' and column_name = 'origen'
    ) then
        raise exception 'Falta la columna compras.origen. Aplica primero 20261123090000_operacion_oficina.sql.';
    end if;

    if (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'perfiles'
          and column_name in ('cedula', 'nombres', 'apellidos')) <> 3 then
        raise exception 'Faltan columnas en public.perfiles (cedula, nombres, apellidos).';
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Autocompletar acompañantes con las compras propias
-- ---------------------------------------------------------------------
create or replace function public.pasajero_de_mis_compras(p_cedula text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    v_usuario uuid := auth.uid();
    v_cedula text := btrim(coalesce(p_cedula, ''));
    v_resultado jsonb;
begin
    if v_usuario is null then
        raise exception 'Inicia sesión.' using errcode = '42501';
    end if;

    if public.rol_actual() is distinct from 'cliente' then
        raise exception 'Solo un cliente puede buscar a sus acompañantes.' using errcode = '42501';
    end if;

    if v_cedula !~ '^[0-9]{10}$' then
        return null;
    end if;

    -- La propia cédula: los nombres del perfil.
    select jsonb_build_object('nombres', p.nombres, 'apellidos', p.apellidos)
      into v_resultado
    from public.perfiles as p
    where p.id = v_usuario
      and p.cedula = v_cedula
      and nullif(btrim(coalesce(p.nombres, '')), '') is not null
      and nullif(btrim(coalesce(p.apellidos, '')), '') is not null;

    if v_resultado is not null then
        return v_resultado;
    end if;

    -- Un acompañante: el boleto más reciente de las compras de esta cuenta.
    select jsonb_build_object('nombres', b.pasajero_nombres, 'apellidos', b.pasajero_apellidos)
      into v_resultado
    from public.boletos as b
    join public.compras as c on c.id = b.compra_id
    where c.comprador_id = v_usuario
      and b.pasajero_cedula = v_cedula
    order by b.creado_en desc
    limit 1;

    return v_resultado;
end;
$function$;

-- ---------------------------------------------------------------------
-- 2. Permisos
-- ---------------------------------------------------------------------
revoke all on function public.pasajero_de_mis_compras(text) from public, anon;
grant execute on function public.pasajero_de_mis_compras(text) to authenticated;

notify pgrst, 'reload schema';

commit;

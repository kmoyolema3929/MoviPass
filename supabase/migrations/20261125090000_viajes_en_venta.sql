-- =====================================================================
-- Cambio 4, ajuste a la parte 4.2: la búsqueda no muestra viajes que ya
-- salieron (hora de Ecuador), en curso ni finalizados.
--
-- Parte de la base en la nube (cambio4-base-nube.txt) con las migraciones
-- 20261123090000_operacion_oficina.sql y 20261124090000_compra_cliente.sql
-- aplicadas. No crea tablas.
--
-- Qué cambia:
--   1. viaje_a_la_venta(viaje): la misma regla de _viaje_para_venta, sin
--      errores: frecuencia activa, hoja de ruta "Programado" (si tiene),
--      no en curso ni finalizado y con salida (fecha + hora) posterior a la
--      hora actual de Ecuador.
--   2. a_la_venta(viajes): columna calculada para filtrar en la consulta
--      (PostgREST: .eq('a_la_venta', true)). La usan la búsqueda del cliente
--      y la lista de la venta en ventanilla.
--   3. Política "consulta publica de viajes" (lectura). Antes cualquier rol
--      distinto de cooperativa leía todos los viajes. Ahora:
--        - visitante (sin sesión) o cuenta inactiva: solo viajes a la venta;
--        - cliente: viajes a la venta y los de sus propias compras (para su
--          historial, el pago y el boleto);
--        - cooperativa (gerente): los de sus buses, igual que antes;
--        - administrador, oficinista y usuario bus: igual que antes (los
--          necesitan para la hoja de ruta, el despacho, los reportes y la
--          operación del viaje).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Comprobaciones previas
-- ---------------------------------------------------------------------
do $$
begin
    if to_regprocedure('public.rol_actual()') is null
       or to_regprocedure('public.es_mi_bus(uuid)') is null then
        raise exception 'Faltan las funciones public.rol_actual() o public.es_mi_bus(uuid). Aplica las migraciones anteriores.';
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'viajes' and column_name = 'estado_operativo'
    ) then
        raise exception 'Falta la columna viajes.estado_operativo. Aplica primero 20261123090000_operacion_oficina.sql.';
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'viajes' and policyname = 'consulta publica de viajes'
    ) then
        raise exception 'No existe la política "consulta publica de viajes" en public.viajes. Envía las políticas de viajes (pg_policies) antes de aplicar esta migración.';
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Regla: el viaje está a la venta
-- ---------------------------------------------------------------------
create or replace function public.viaje_a_la_venta(p_viaje_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
    select exists (
        select 1
        from public.viajes as v
        join public.frecuencias as f on f.id = v.frecuencia_id
        left join public.hojas_ruta as h on h.id = v.hoja_ruta_id
        where v.id = p_viaje_id
          and f.activa
          and (v.hoja_ruta_id is null or h.estado = 'Programado')
          and v.estado_operativo not in ('en_curso', 'finalizado')
          and (v.fecha + f.hora) > (now() at time zone 'America/Guayaquil')
    );
$function$;

-- ---------------------------------------------------------------------
-- 2. Columna calculada para la consulta (PostgREST)
-- ---------------------------------------------------------------------
create or replace function public.a_la_venta(p_viaje public.viajes)
returns boolean
language sql
stable
set search_path to ''
as $function$
    select public.viaje_a_la_venta(p_viaje.id);
$function$;

-- El viaje pertenece a una compra de la cuenta (historial, pago y boleto).
create or replace function public.es_viaje_de_mis_compras(p_viaje_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
    select auth.uid() is not null and exists (
        select 1
        from public.compras as c
        where c.viaje_id = p_viaje_id
          and c.comprador_id = auth.uid()
    );
$function$;

-- ---------------------------------------------------------------------
-- 3. Lectura de viajes
-- ---------------------------------------------------------------------
drop policy if exists "consulta publica de viajes" on public.viajes;
create policy "consulta publica de viajes"
on public.viajes
for select
to anon, authenticated
using (
    case coalesce((select public.rol_actual()), '')
        when 'cooperativa' then public.es_mi_bus(bus_id)
        when 'cliente' then public.viaje_a_la_venta(id) or public.es_viaje_de_mis_compras(id)
        when '' then public.viaje_a_la_venta(id)
        else true
    end
);

-- ---------------------------------------------------------------------
-- 4. Permisos (las políticas se evalúan con el rol de quien consulta)
-- ---------------------------------------------------------------------
revoke all on function public.viaje_a_la_venta(uuid) from public;
revoke all on function public.a_la_venta(public.viajes) from public;
revoke all on function public.es_viaje_de_mis_compras(uuid) from public;
grant execute on function public.viaje_a_la_venta(uuid) to anon, authenticated;
grant execute on function public.a_la_venta(public.viajes) to anon, authenticated;
grant execute on function public.es_viaje_de_mis_compras(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

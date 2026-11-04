-- Corrección de políticas RLS y permisos
--
-- Problemas que corrige:
--  * frecuencias: cualquiera (incluso sin iniciar sesión) podía insertar, editar y borrar.
--  * paradas: cualquier usuario autenticado (incluido un cliente) podía modificarlas.
--  * hojas_ruta: una cooperativa podía modificar hojas de ruta de otra cooperativa.
--  * perfiles: el administrador no podía cambiar roles y el usuario podía editar su cédula.
--  * buses: la cooperativa no podía registrar sus propios buses (solo el administrador).

begin;

-- ======================================================================
-- 1. PERFILES
-- ======================================================================
-- El usuario ya no inserta ni borra perfiles (los crea el trigger).
revoke insert, delete on table public.perfiles from authenticated;

-- Solo se pueden actualizar estas columnas. La cédula queda bloqueada.
-- El rol sigue protegido: un usuario normal no puede cambiarlo porque
-- la política "usuario edita su perfil" exige que el rol no cambie.
revoke update on table public.perfiles from authenticated;
grant update (nombres, apellidos, telefono, rol)
  on table public.perfiles to authenticated;

-- El administrador puede editar cualquier perfil (asignar roles).
create policy "administrador edita perfiles"
  on public.perfiles
  for update
  to authenticated
  using ((select public.rol_actual()) = 'administrador')
  with check ((select public.rol_actual()) = 'administrador');

-- ======================================================================
-- 2. FRECUENCIAS: lectura pública, escritura solo administrador o cooperativa
-- ======================================================================
drop policy if exists "Permitir insercion a usuarios autenticados" on public.frecuencias;
drop policy if exists "Permitir actualizacion a usuarios autenticados" on public.frecuencias;
drop policy if exists "Permitir eliminacion a usuarios autenticados" on public.frecuencias;

revoke insert, update, delete on table public.frecuencias from anon;
grant select on table public.frecuencias to anon, authenticated;
grant insert, update, delete on table public.frecuencias to authenticated;

create policy "administrador y cooperativa crean frecuencias"
  on public.frecuencias
  for insert
  to authenticated
  with check ((select public.rol_actual()) in ('administrador', 'cooperativa'));

create policy "administrador y cooperativa editan frecuencias"
  on public.frecuencias
  for update
  to authenticated
  using ((select public.rol_actual()) in ('administrador', 'cooperativa'))
  with check ((select public.rol_actual()) in ('administrador', 'cooperativa'));

create policy "administrador y cooperativa eliminan frecuencias"
  on public.frecuencias
  for delete
  to authenticated
  using ((select public.rol_actual()) in ('administrador', 'cooperativa'));

-- ======================================================================
-- 3. PARADAS: lectura pública, escritura solo administrador o cooperativa
-- ======================================================================
drop policy if exists "Permitir insercion a usuarios autenticados" on public.paradas;
drop policy if exists "Permitir actualizacion a usuarios autenticados" on public.paradas;
drop policy if exists "Permitir eliminacion a usuarios autenticados" on public.paradas;

revoke insert, update, delete on table public.paradas from anon;
grant select on table public.paradas to anon, authenticated;
grant insert, update, delete on table public.paradas to authenticated;

create policy "administrador y cooperativa crean paradas"
  on public.paradas
  for insert
  to authenticated
  with check ((select public.rol_actual()) in ('administrador', 'cooperativa'));

create policy "administrador y cooperativa editan paradas"
  on public.paradas
  for update
  to authenticated
  using ((select public.rol_actual()) in ('administrador', 'cooperativa'))
  with check ((select public.rol_actual()) in ('administrador', 'cooperativa'));

create policy "administrador y cooperativa eliminan paradas"
  on public.paradas
  for delete
  to authenticated
  using ((select public.rol_actual()) in ('administrador', 'cooperativa'));

-- ======================================================================
-- 4. HOJAS_RUTA: la cooperativa solo gestiona hojas de SUS buses
-- ======================================================================
drop policy if exists "Permitir insercion a administrador o cooperativa en hojas_ruta" on public.hojas_ruta;
drop policy if exists "Permitir actualizacion a administrador o cooperativa en hojas_ruta" on public.hojas_ruta;
drop policy if exists "Permitir eliminacion a administrador o cooperativa en hojas_ruta" on public.hojas_ruta;

revoke insert, update, delete on table public.hojas_ruta from anon;
grant select on table public.hojas_ruta to anon, authenticated;
grant insert, update, delete on table public.hojas_ruta to authenticated;

create policy "crear hojas de ruta autorizadas"
  on public.hojas_ruta
  for insert
  to authenticated
  with check (
    (select public.rol_actual()) = 'administrador'
    or (
      (select public.rol_actual()) = 'cooperativa'
      and exists (
        select 1
        from public.buses as b
        join public.cooperativas_usuarios as asignacion
          on asignacion.cooperativa_id = b.cooperativa_id
        where b.id = hojas_ruta.bus_id
          and asignacion.perfil_id = (select auth.uid())
      )
    )
  );

create policy "editar hojas de ruta autorizadas"
  on public.hojas_ruta
  for update
  to authenticated
  using (
    (select public.rol_actual()) = 'administrador'
    or (
      (select public.rol_actual()) = 'cooperativa'
      and exists (
        select 1
        from public.buses as b
        join public.cooperativas_usuarios as asignacion
          on asignacion.cooperativa_id = b.cooperativa_id
        where b.id = hojas_ruta.bus_id
          and asignacion.perfil_id = (select auth.uid())
      )
    )
  )
  with check (
    (select public.rol_actual()) = 'administrador'
    or (
      (select public.rol_actual()) = 'cooperativa'
      and exists (
        select 1
        from public.buses as b
        join public.cooperativas_usuarios as asignacion
          on asignacion.cooperativa_id = b.cooperativa_id
        where b.id = hojas_ruta.bus_id
          and asignacion.perfil_id = (select auth.uid())
      )
    )
  );

create policy "eliminar hojas de ruta autorizadas"
  on public.hojas_ruta
  for delete
  to authenticated
  using (
    (select public.rol_actual()) = 'administrador'
    or (
      (select public.rol_actual()) = 'cooperativa'
      and exists (
        select 1
        from public.buses as b
        join public.cooperativas_usuarios as asignacion
          on asignacion.cooperativa_id = b.cooperativa_id
        where b.id = hojas_ruta.bus_id
          and asignacion.perfil_id = (select auth.uid())
      )
    )
  );

-- ======================================================================
-- 5. BUSES: la cooperativa registra y edita los buses de su cooperativa
--    (el documento del profesor: "COOPERATIVA ingresa los buses")
-- ======================================================================
create policy "cooperativa crea buses propios"
  on public.buses
  for insert
  to authenticated
  with check (
    (select public.rol_actual()) = 'cooperativa'
    and exists (
      select 1
      from public.cooperativas_usuarios as asignacion
      where asignacion.cooperativa_id = buses.cooperativa_id
        and asignacion.perfil_id = (select auth.uid())
    )
  );

create policy "cooperativa edita buses propios"
  on public.buses
  for update
  to authenticated
  using (
    (select public.rol_actual()) = 'cooperativa'
    and exists (
      select 1
      from public.cooperativas_usuarios as asignacion
      where asignacion.cooperativa_id = buses.cooperativa_id
        and asignacion.perfil_id = (select auth.uid())
    )
  )
  with check (
    (select public.rol_actual()) = 'cooperativa'
    and exists (
      select 1
      from public.cooperativas_usuarios as asignacion
      where asignacion.cooperativa_id = buses.cooperativa_id
        and asignacion.perfil_id = (select auth.uid())
    )
  );

create policy "cooperativa elimina buses propios"
  on public.buses
  for delete
  to authenticated
  using (
    (select public.rol_actual()) = 'cooperativa'
    and exists (
      select 1
      from public.cooperativas_usuarios as asignacion
      where asignacion.cooperativa_id = buses.cooperativa_id
        and asignacion.perfil_id = (select auth.uid())
    )
  );

commit;

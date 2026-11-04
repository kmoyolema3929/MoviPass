-- Acceso del oficinista a su cooperativa
--
-- Las políticas originales solo permitían al administrador y a las cuentas de
-- cooperativa leer cooperativas_usuarios y cooperativas. El panel del
-- oficinista necesita conocer la cooperativa a la que pertenece para filtrar
-- sus viajes, compras e historial, así que se le permite leer únicamente su
-- propia asignación y la cooperativa asignada.

begin;

drop policy if exists "consulta de asignaciones autorizadas" on public.cooperativas_usuarios;
create policy "consulta de asignaciones autorizadas"
  on public.cooperativas_usuarios
  for select
  to authenticated
  using (
    (select public.rol_actual()) = 'administrador'
    or (
      (select public.rol_actual()) in ('cooperativa', 'oficinista')
      and perfil_id = (select auth.uid())
    )
  );

drop policy if exists "cooperativa consulta sus cooperativas" on public.cooperativas;
create policy "cooperativa consulta sus cooperativas"
  on public.cooperativas
  for select
  to authenticated
  using (
    (select public.rol_actual()) in ('cooperativa', 'oficinista')
    and exists (
      select 1
      from public.cooperativas_usuarios as asignacion
      where asignacion.cooperativa_id = cooperativas.id
        and asignacion.perfil_id = (select auth.uid())
    )
  );

commit;

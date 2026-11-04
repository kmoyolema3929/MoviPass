-- Migración: exponer la tabla perfiles a la API
-- Issue #9

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.perfiles to authenticated;
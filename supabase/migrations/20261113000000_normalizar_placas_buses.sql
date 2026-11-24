-- Cambio 10 (emergencia): placas de bus duplicadas por formato.
-- "ABC1234", "ABC-1234" y "ABC 1234" se guardaban como buses distintos.
-- Esta migración deja todas las placas como ABC-1234 y obliga ese formato.
--
-- No borra nada. Si alguna placa no se puede normalizar, o si dos buses
-- quedarían con la misma placa, se detiene sin cambiar nada y dice cuáles son.

begin;

-- Placa actual y placa normalizada (sin espacios ni guiones, en mayúsculas, ABC-1234)
create temporary table placas_normalizadas on commit drop as
select id,
       placa,
       regexp_replace(
         regexp_replace(upper(placa), '[[:space:]-]', '', 'g'),
         '^([A-Z]{3})([0-9]{4})$', '\1-\2'
       ) as nueva
  from public.buses;

do $$
declare
  detalle text;
begin
  -- 1. Placas que no tienen 3 letras y 4 números
  select string_agg(format('%s (bus %s)', placa, id), ', ' order by placa)
    into detalle
    from placas_normalizadas
   where nueva !~ '^[A-Z]{3}-[0-9]{4}$';

  if detalle is not null then
    raise exception 'Hay placas que no se pueden llevar al formato ABC-1234: %', detalle
      using hint = 'Corrige esas placas a mano y vuelve a ejecutar la migración. No se cambió nada.';
  end if;

  -- 2. Buses que quedarían con la misma placa
  select string_agg(grupo, '; ' order by grupo)
    into detalle
    from (
      select format('%s <- %s', nueva,
                    string_agg(format('%s (bus %s)', placa, id), ', ' order by placa)) as grupo
        from placas_normalizadas
       group by nueva
      having count(*) > 1
    ) as repetidas;

  if detalle is not null then
    raise exception 'Hay buses que quedarían con la misma placa: %', detalle
      using hint = 'Revisa si son el mismo bus físico y decide cuál conservar. No se cambió nada.';
  end if;
end;
$$;

-- 3. Normalizar las placas guardadas
update public.buses as b
   set placa = p.nueva
  from placas_normalizadas as p
 where p.id = b.id
   and b.placa is distinct from p.nueva;

-- 4. La base solo acepta el formato ABC-1234
alter table public.buses
  add constraint buses_placa_formato_check
  check (placa ~ '^[A-Z]{3}-[0-9]{4}$');

commit;

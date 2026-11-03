-- Issue #41: viajes y permisos para la busqueda.
BEGIN;

CREATE TABLE public.viajes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    frecuencia_id BIGINT NOT NULL
        REFERENCES public.frecuencias(id),

    bus_id UUID NOT NULL
        REFERENCES public.buses(id),

    fecha DATE NOT NULL,

    precio NUMERIC(10,2) NOT NULL
        CHECK (precio >= 0),

    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX viajes_fecha_frecuencia_idx
ON public.viajes(fecha, frecuencia_id);

CREATE INDEX viajes_bus_idx
ON public.viajes(bus_id);

ALTER TABLE public.viajes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consulta publica de viajes"
ON public.viajes
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "administrador crea viajes"
ON public.viajes
FOR INSERT
TO authenticated
WITH CHECK (
    (SELECT public.rol_actual()) = 'administrador'
);

CREATE POLICY "administrador edita viajes"
ON public.viajes
FOR UPDATE
TO authenticated
USING (
    (SELECT public.rol_actual()) = 'administrador'
)
WITH CHECK (
    (SELECT public.rol_actual()) = 'administrador'
);

CREATE POLICY "administrador elimina viajes"
ON public.viajes
FOR DELETE
TO authenticated
USING (
    (SELECT public.rol_actual()) = 'administrador'
);

GRANT SELECT ON public.viajes TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE
ON public.viajes TO authenticated;

GRANT SELECT ON public.frecuencias TO anon, authenticated;

GRANT SELECT (id, tipo_bus, cooperativa_id)
ON public.buses TO anon, authenticated;

GRANT SELECT (id, nombre)
ON public.cooperativas TO anon, authenticated;

CREATE POLICY "busqueda consulta buses con viajes"
ON public.buses
FOR SELECT
TO anon, authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.viajes v
        WHERE v.bus_id = buses.id
    )
);

CREATE POLICY "busqueda consulta cooperativas con viajes"
ON public.cooperativas
FOR SELECT
TO anon, authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.buses b
        JOIN public.viajes v ON v.bus_id = b.id
        WHERE b.cooperativa_id = cooperativas.id
    )
);

COMMIT;
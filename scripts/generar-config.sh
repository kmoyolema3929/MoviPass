#!/bin/sh
# Genera frontend/js/config.js durante el despliegue en Netlify,
# a partir de las variables de entorno configuradas en el panel del sitio.
# Solo se usan la URL del proyecto y la clave anon. La clave service_role NUNCA va aquí.
set -e

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "Faltan las variables SUPABASE_URL y SUPABASE_ANON_KEY en Netlify" >&2
  exit 1
fi

cat > frontend/js/config.js <<EOF
export const SUPABASE_URL = "$SUPABASE_URL";
export const SUPABASE_ANON_KEY = "$SUPABASE_ANON_KEY";
EOF

echo "frontend/js/config.js generado"

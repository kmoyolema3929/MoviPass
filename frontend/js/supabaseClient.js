// Crea el cliente de Supabase usando la configuración local.
// config.js no se sube al repositorio.
// Se usa config.example.js como plantilla.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
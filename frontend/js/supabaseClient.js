// frontend/js/supabaseClient.js
// Crea el cliente de Supabase usando las credenciales de config.js.
// config.js NO se sube al repositorio (está en .gitignore).
// Se usa config.example.js como plantilla.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
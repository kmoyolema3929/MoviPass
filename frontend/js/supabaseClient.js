import { createClient } from
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm";

import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY
} from "./config.js";

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);
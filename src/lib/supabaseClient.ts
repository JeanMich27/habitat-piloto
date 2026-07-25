import { createClient } from "@supabase/supabase-js";

// Piloto sin backend propio: usamos Supabase (Postgres + Realtime) como base
// de datos compartida para las 10 personas de la prueba. Si no hay variables
// de entorno configuradas, la app sigue funcionando en "modo local" (los
// datos se guardan solo en el navegador de cada quien, vía localStorage) —
// así el proyecto no se rompe mientras se conecta el proyecto de Supabase.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

export const isCloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isCloudEnabled
  ? createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string)
  : null;

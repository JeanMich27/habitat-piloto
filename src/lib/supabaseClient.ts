import { createClient } from "@supabase/supabase-js";

export interface AppConfigInput {
  appMode?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  production: boolean;
}

export type AppConfig =
  | { mode: "cloud"; error: null }
  | { mode: "demo"; error: null }
  | { mode: "blocked"; error: string };

export function resolveAppConfig(input: AppConfigInput): AppConfig {
  const mode = input.appMode?.trim().toLowerCase() || "cloud";
  const hasCloud = Boolean(input.supabaseUrl?.trim() && input.supabaseAnonKey?.trim());

  if (mode === "demo") {
    if (input.production) {
      return {
        mode: "blocked",
        error: "El modo demostración está deshabilitado en producción.",
      };
    }
    return { mode: "demo", error: null };
  }

  if (mode !== "cloud") {
    return { mode: "blocked", error: `VITE_APP_MODE no válido: ${mode}.` };
  }

  if (!hasCloud) {
    return {
      mode: "blocked",
      error: "Falta configurar VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.",
    };
  }

  return { mode: "cloud", error: null };
}

// Piloto sin backend propio: usamos Supabase (Postgres + Realtime) como base
// de datos compartida para las 10 personas de la prueba. Si no hay variables
// de entorno configuradas, la app sigue funcionando en "modo local" (los
// datos se guardan solo en el navegador de cada quien, vía localStorage) —
// así el proyecto no se rompe mientras se conecta el proyecto de Supabase.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

export const appConfig = resolveAppConfig({
  appMode: import.meta.env.VITE_APP_MODE,
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  production: import.meta.env.PROD,
});

export const isCloudEnabled = appConfig.mode === "cloud";
export const isDemoMode = appConfig.mode === "demo";
export const configurationError = appConfig.error;

export const supabase = isCloudEnabled
  ? createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string)
  : null;

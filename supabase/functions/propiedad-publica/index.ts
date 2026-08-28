// Ficha comercial pública de un inmueble. La RPC mantiene fuera dirección
// exacta, propietario, comisiones, ids internos y cualquier nota operativa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "GET") return json({ error: "Método no permitido" }, 405);

  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug || !/^[a-z0-9-]{1,120}$/.test(slug)) {
    return json({ error: "Propiedad no encontrada" }, 404);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await supabase.rpc("propiedad_publica_por_slug", { p_slug: slug });
  if (error) {
    console.error("[propiedad-publica] propiedad_publica_por_slug", error);
    return json({ error: "Error interno" }, 500);
  }
  return data ? json(data) : json({ error: "Propiedad no encontrada" }, 404);
});

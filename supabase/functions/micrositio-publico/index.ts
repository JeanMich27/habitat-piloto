// Edge Function: micrositio público del asesor
//
// Publica el perfil de un asesor/broker como JSON, sin sesión, por slug
// opaco — mismo modelo que agenda-ics para el feed de calendario.
//
//   GET /functions/v1/micrositio-publico?slug=<slug_publico>
//   → application/json
//
// AUTENTICACIÓN (verify_jwt = false, a propósito):
//
// Quien visita el micrositio de un asesor (un cliente potencial) no tiene
// sesión en la plataforma y nunca la va a tener — es tráfico público, igual
// que la ficha técnica compartida por enlace. Con el JWT de plataforma
// activado, la petición muere en 401 antes de llegar a este código.
//
//   - perfil_publico_por_slug() tiene EXECUTE revocado a PUBLIC, anon Y
//     authenticated (los tres — revocar solo PUBLIC no basta en Supabase,
//     ya se documentó con citas_por_token). Solo esta función, con
//     service_role, puede llamarla.
//   - Un slug que no existe devuelve 404 explícito. A diferencia del feed de
//     agenda, aquí no hay valor en esconder si el slug existe o no: el slug
//     se genera del nombre del asesor, no es secreto, y un asesor querría
//     saber si su propia URL está mal escrita en una tarjeta impresa.
//   - Nunca se expone correo ni el id interno del usuario — solo lo que
//     perfil_publico_por_slug() ya filtró.
//
// Decisión de Jean (26 ago 2026): el micrositio siempre está activo, con o
// sin datos de marca cargados — perfil_completo en la respuesta le dice al
// frontend si debe mostrar un estado "en construcción" en las secciones
// vacías, nunca bloquear la página completa.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");

  // Mismo alfabeto que produce slug_de_texto(): minúsculas, dígitos y
  // guiones. Cualquier otra cosa no puede ser un slug real.
  const SLUG = /^[a-z0-9-]{1,120}$/;
  if (!slug || !SLUG.test(slug)) {
    return new Response(JSON.stringify({ error: "Micrositio no encontrado" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase.rpc("perfil_publico_por_slug", { p_slug: slug });

  if (error) {
    console.error("[micrositio-publico] perfil_publico_por_slug", error);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
    });
  }

  if (!data) {
    return new Response(JSON.stringify({ error: "Micrositio no encontrado" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
    });
  }

  return new Response(JSON.stringify(data), {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      // El perfil es editable y el usuario espera ver el resultado al volver
      // al micrositio; no retenemos una respuesta anterior en navegador/CDN.
      "Cache-Control": "no-store",
    },
  });
});

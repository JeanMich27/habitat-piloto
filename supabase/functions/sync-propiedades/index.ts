// ============================================================
// sync-propiedades
// Trae el catálogo real de EasyBroker a la plataforma y vincula
// cada propiedad con su asesor dueño. Es la base del ruteo:
// sin esto, un lead no sabe a quién pertenece.
//
// Diseño clave:
//  - Idempotente: se puede correr mil veces sin duplicar.
//  - No destructivo: si la propiedad ya existe, solo actualiza los
//    campos que manda EasyBroker y respeta lo capturado a mano
//    (propietario, documentos, eventos, estatus).
//  - Los asesores se crean en estado "Invitado", no "Activo":
//    aparecen en el sistema pero no tienen acceso hasta registrarse.
//
// v3 — Mapeo completo. Antes se descartaban fotos, amenidades, comisión
// pactada, terreno, medios baños, estacionamientos, video y ubicación
// granular. La ficha se veía vacía y la comisión era un supuesto de la app
// cuando EasyBroker ya la trae por propiedad.
//
// Los campos se guardan con nombres genéricos (no `eb_*`) porque la
// plataforma se va a conectar con otros CRMs: la columna describe el dato,
// y `crm_origen` describe de dónde vino.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EB_BASE = "https://api.easybroker.com/v1";
const EB_KEY = Deno.env.get("EASYBROKER_API_KEY") ?? "";
// Los procesos automáticos corren con service_role: no pasan por RLS y por eso
// no heredan la oficina del usuario. Hay que mandarla explícita.
const AGENCIA = Deno.env.get("AGENCIA_ID") ?? "default";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

async function eb(path: string): Promise<any> {
  const r = await fetch(`${EB_BASE}${path}`, {
    headers: { "X-Authorization": EB_KEY, accept: "application/json" },
  });
  if (!r.ok) throw new Error(`EasyBroker ${path} respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

// EasyBroker usa más tipos de inmueble que la plataforma. Traducimos los
// conocidos y dejamos pasar el resto tal cual (la columna es texto libre).
const TIPO_INMUEBLE: Record<string, string> = {
  "Departamento": "Depto",
  "Depto": "Depto",
  "Casa": "Casa",
  "Casa en condominio": "Casa",
  "Terreno": "Terreno",
  "Local comercial": "Local",
  "Local Comercial": "Local",
};

function partesUbicacion(nombre: string) {
  const p = (nombre ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    ubicacion: nombre ?? "",
    // La primera parte suele ser la colonia; las dos últimas, municipio y estado.
    colonia: p.length >= 3 ? p[0] : "",
    municipio: p.length >= 2 ? p[p.length - 2] : "",
    estado: p.length >= 1 ? p[p.length - 1] : "",
  };
}

function iniciales(nombre: string) {
  return (nombre ?? "")
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "").join("") || "NA";
}

/**
 * Comisión pactada de la operación.
 * EasyBroker la entrega como { type: "months" | "percentage", value: n }.
 * Se normaliza al vocabulario de la plataforma para que no dependa del CRM.
 */
function normalizarComision(op: any) {
  const c = op?.commission;
  if (!c || c.value == null) return { comision_tipo: null, comision_valor: null };
  const tipo = String(c.type ?? "").toLowerCase();
  if (tipo === "months" || tipo === "month") {
    return { comision_tipo: "meses", comision_valor: Number(c.value) || null };
  }
  if (tipo === "percentage" || tipo === "percent") {
    return { comision_tipo: "porcentaje", comision_valor: Number(c.value) || null };
  }
  return { comision_tipo: null, comision_valor: null };
}

/** URLs de fotos en el orden que las publica el CRM (la primera es la portada). */
function normalizarImagenes(p: any): string[] {
  const fuente = Array.isArray(p.property_images) && p.property_images.length
    ? p.property_images
    : (p.images ?? []);
  return fuente
    .map((i: any) => (typeof i === "string" ? i : i?.url))
    .filter((u: unknown): u is string => typeof u === "string" && u.length > 0);
}

/** Amenidades como lista plana de nombres: es lo que sirve para hacer match. */
function normalizarAmenidades(p: any): string[] {
  return (p.features ?? [])
    .map((f: any) => (typeof f === "string" ? f : f?.name))
    .filter((n: unknown): n is string => typeof n === "string" && n.length > 0);
}

// Resuelve el asesor: primero por vínculo directo, luego por correo
// (así se conecta con quienes ya están registrados), y si no existe lo crea.
const cacheAsesor = new Map<number, string | null>();
async function resolverAsesor(agent: any): Promise<string | null> {
  if (!agent?.id) return null;
  if (cacheAsesor.has(agent.id)) return cacheAsesor.get(agent.id)!;

  const porVinculo = await sb.from("usuarios").select("id").eq("eb_agent_id", agent.id).maybeSingle();
  if (porVinculo.data?.id) { cacheAsesor.set(agent.id, porVinculo.data.id); return porVinculo.data.id; }

  const correo = (agent.email ?? "").toLowerCase().trim();
  if (correo) {
    const porCorreo = await sb.from("usuarios").select("id").eq("correo", correo).maybeSingle();
    if (porCorreo.data?.id) {
      await sb.from("usuarios").update({ eb_agent_id: agent.id }).eq("id", porCorreo.data.id);
      cacheAsesor.set(agent.id, porCorreo.data.id);
      return porCorreo.data.id;
    }
  }

  const id = `eb-agent-${agent.id}`;
  const ins = await sb.from("usuarios").upsert({
    id,
    nombre: agent.full_name ?? agent.name ?? "Asesor sin nombre",
    correo: correo || `${id}@easybroker.local`,
    telefono: agent.mobile_phone ?? "",
    rol: "asesor_equipo",
    puesto: "Asesor",
    iniciales: iniciales(agent.full_name ?? agent.name ?? ""),
    estado_cuenta: "Invitado",
    puede_ver_otras_propiedades: false,
    eb_agent_id: agent.id,
    agencia_id: AGENCIA,
  }, { onConflict: "id" }).select("id").maybeSingle();

  const resuelto = ins.data?.id ?? null;
  cacheAsesor.set(agent.id, resuelto);
  return resuelto;
}

async function enLotes<T>(items: T[], tamano: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += tamano) {
    await Promise.all(items.slice(i, i + tamano).map(fn));
    await new Promise((r) => setTimeout(r, 350)); // respeta el límite de 20 req/s
  }
}

Deno.serve(async (req) => {
  // --- Autenticación propia -------------------------------------------------
  // `verify_jwt` (activo en config.toml) solo exige QUE HAYA un JWT válido, y
  // la anon key pública -la misma que va en el bundle del navegador y en
  // VITE_SUPABASE_ANON_KEY- ES un JWT válido. Sin este chequeo, cualquiera que
  // copie esa llave del bundle puede disparar el sync en loop: gasta la cuota
  // paga de EasyBroker y satura la base. El secreto vive solo en Vault (nunca
  // en el bundle ni en variables de entorno de la función); ver migración 13.
  const { data: secretoValido, error: errSecreto } = await sb.rpc("validar_secreto_sync", {
    p_secreto: req.headers.get("x-sync-secret") ?? "",
  });
  if (errSecreto || !secretoValido) {
    return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const inicio = Date.now();
  const resumen = {
    revisadas: 0, creadas: 0, actualizadas: 0,
    con_fotos: 0, con_comision: 0, con_amenidades: 0,
    asesores_vinculados: new Set<string>(),
    tipos_encontrados: new Set<string>(),
    sin_asesor: [] as string[],
    sin_fotos: [] as string[],
    errores: [] as string[],
  };

  try {
    if (!EB_KEY) throw new Error("Falta el secreto EASYBROKER_API_KEY en el proyecto de Supabase.");

    // 1) Lista de IDs públicos (paginada)
    const ids: string[] = [];
    for (let page = 1; page <= 40; page++) {
      const data = await eb(`/properties?page=${page}&limit=50`);
      for (const p of data.content ?? []) if (p.public_id) ids.push(p.public_id);
      if (!data.pagination?.next_page) break;
    }

    // 2) Detalle de cada una (el detalle trae el asesor con correo; la lista no)
    await enLotes(ids, 5, async (publicId) => {
      try {
        const p = await eb(`/properties/${publicId}`);
        resumen.revisadas++;
        if (p.property_type) resumen.tipos_encontrados.add(p.property_type);

        const asesorId = await resolverAsesor(p.agent);
        if (asesorId) resumen.asesores_vinculados.add(asesorId);
        else resumen.sin_asesor.push(publicId);

        const op = (p.operations ?? [])[0] ?? {};
        const loc = partesUbicacion(p.location?.name ?? "");
        const imagenes = normalizarImagenes(p);
        const amenidades = normalizarAmenidades(p);
        const comision = normalizarComision(op);

        if (imagenes.length) resumen.con_fotos++; else resumen.sin_fotos.push(publicId);
        if (comision.comision_valor != null) resumen.con_comision++;
        if (amenidades.length) resumen.con_amenidades++;

        const camposEB = {
          titulo: p.title ?? `Propiedad ${publicId}`,
          ubicacion: loc.ubicacion,
          municipio: loc.municipio,
          estado: loc.estado,
          colonia: loc.colonia,
          calle: p.location?.street ?? "",
          codigo_postal: p.location?.postal_code ?? "",
          latitud: p.location?.latitude ?? null,
          longitud: p.location?.longitude ?? null,
          precio: Number(op.amount) || 0,
          recamaras: Number(p.bedrooms) || 0,
          banos: Number(p.bathrooms) || 0,
          medios_banos: Number(p.half_bathrooms) || 0,
          estacionamientos: Number(p.parking_spaces) || 0,
          niveles: p.floors != null ? Number(p.floors) : null,
          // m2 = construcción (lo que se compara en precio por m2);
          // el terreno se guarda aparte en vez de perderse.
          m2: Number(p.construction_size ?? p.lot_size) || 0,
          m2_terreno: Number(p.lot_size) || 0,
          mantenimiento: p.maintenance_amount != null ? Number(p.maintenance_amount) : null,
          descripcion: p.description ?? "",
          tipo_inmueble: TIPO_INMUEBLE[p.property_type] ?? (p.property_type ?? "Casa"),
          tipo_operacion: op.type === "rental" ? "Renta" : "Venta",
          asesor_id: asesorId,
          imagenes,
          amenidades,
          video_url: (p.videos ?? [])[0] ?? null,
          tour_virtual_url: p.virtual_tour ?? null,
          ...comision,
          comision_compartida_pct: p.share_commission
            ? Number(p.shared_commission_percentage) || null
            : null,
          exclusiva: Boolean(p.exclusive),
          agencia_id: AGENCIA,
          crm_origen: "easybroker",
          crm_id_interno: p.internal_id ?? null,
          eb_public_id: publicId,
          eb_public_url: p.public_url ?? null,
          eb_sincronizado_en: new Date().toISOString(),
          publicada_el: p.published_at ?? null,
        };

        const existente = await sb.from("propiedades").select("id").eq("eb_public_id", publicId).maybeSingle();

        if (existente.data?.id) {
          // Respeta lo capturado a mano: no toca propietario, documentos,
          // eventos, comparables ni estatus.
          const up = await sb.from("propiedades").update(camposEB).eq("id", existente.data.id);
          if (up.error) throw new Error(up.error.message);
          resumen.actualizadas++;
        } else {
          const ins = await sb.from("propiedades").insert({
            id: `eb-${publicId.toLowerCase()}`,
            ...camposEB,
            // Estados comerciales (migración 08). Lo que EasyBroker publica
            // entra como "Publicada"; el broker la mueve desde la app.
            estatus: "Publicada",
            propietario: { nombre: "", correo: "", telefono: "" },
            documentos: [],
            eventos: [],
            comparables: [],
            capturada_el: p.created_at ?? new Date().toISOString(),
            ultima_actividad: p.updated_at ?? null,
          });
          if (ins.error) throw new Error(ins.error.message);
          resumen.creadas++;
        }
      } catch (e) {
        resumen.errores.push(`${publicId}: ${(e as Error).message}`);
      }
    });

    const salida = {
      ok: resumen.errores.length === 0,
      segundos: Math.round((Date.now() - inicio) / 1000),
      revisadas: resumen.revisadas,
      creadas: resumen.creadas,
      actualizadas: resumen.actualizadas,
      con_fotos: resumen.con_fotos,
      con_comision_pactada: resumen.con_comision,
      con_amenidades: resumen.con_amenidades,
      asesores_vinculados: resumen.asesores_vinculados.size,
      tipos_encontrados: [...resumen.tipos_encontrados].sort(),
      propiedades_sin_asesor: resumen.sin_asesor,
      propiedades_sin_fotos: resumen.sin_fotos.slice(0, 20),
      errores: resumen.errores.slice(0, 20),
    };

    // La PK de sync_estado es (agencia_id, proceso) desde la migración 01.
    // El error se revisa a propósito: si esto falla en silencio, el semáforo
    // miente y nadie se entera de que el sync está roto.
    const est = await sb.from("sync_estado").upsert({
      agencia_id: AGENCIA,
      proceso: "propiedades_easybroker",
      ultimo_corte: new Date().toISOString(),
      ultima_corrida: new Date().toISOString(),
      ultimo_resultado: JSON.stringify(salida).slice(0, 2000),
      actualizado_en: new Date().toISOString(),
    }, { onConflict: "agencia_id,proceso" });
    if (est.error) salida.errores.push(`sync_estado: ${est.error.message}`);

    return new Response(JSON.stringify(salida, null, 2), {
      headers: { "Content-Type": "application/json" },
      status: salida.ok ? 200 : 207,
    });
  } catch (e) {
    const err = { ok: false, error: (e as Error).message };
    await sb.from("sync_estado").upsert({
      agencia_id: AGENCIA,
      proceso: "propiedades_easybroker",
      ultimo_corte: new Date().toISOString(),
      ultima_corrida: new Date().toISOString(),
      ultimo_resultado: JSON.stringify(err),
      actualizado_en: new Date().toISOString(),
    }, { onConflict: "agencia_id,proceso" });
    return new Response(JSON.stringify(err, null, 2), {
      headers: { "Content-Type": "application/json" }, status: 500,
    });
  }
});

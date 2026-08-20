// ============================================================
// sync-leads  (v5 — 20 ago 2026)
// Trae las solicitudes de contacto de EasyBroker (el buzón de portales) a la
// plataforma, deduplica y rutea al asesor dueño de la propiedad.
//
// DECISIÓN DE DISEÑO IMPORTANTE:
// No usamos un cursor de fecha. El campo happened_at de EasyBroker es
// la hora del EVENTO, no la hora de captura. Cuando alguien registra un
// lead con retraso, queda retrofechado ANTES del cursor y un sync con
// happened_after lo perdería para siempre, en silencio.
// Por eso usamos una VENTANA MÓVIL y confiamos en que la inserción es
// idempotente por eb_contact_request_id.
//
// REGLA DE ORO: nada se descarta en silencio. Cada solicitud termina
// insertada, marcada como duplicada, o marcada para revisión.
//
// v2: el asesor de respaldo es el broker que SÍ tiene login (auth_id).
// v3 (20 ago 2026): arreglo de la ruptura por multi-tenant.
//     - Manda agencia_id explícito: el service_role no pasa por RLS y
//       desde la migración 01 agencia_id es NOT NULL. Sin esto TODO
//       insert fallaba con "El asesor X no pertenece a la agencia <NULL>".
//     - sync_estado ahora tiene PK (agencia_id, proceso): el upsert con
//       onConflict:"proceso" fallaba y, como nadie revisaba el error,
//       el semáforo se quedó congelado 7 días mintiendo que todo iba bien.
//     - Ese error ahora sí se revisa.
//     - SYNC_DIAS_VENTANA permite una corrida histórica puntual
//       (?dias=400) sin cambiar el valor de siempre.
// v5 (20 ago 2026): la lectura de "lo que ya se procesó" estaba truncada.
//     `select("eb_contact_request_id")` sin paginar devuelve como máximo 1,000
//     filas (tope duro de PostgREST, y no avisa: simplemente devuelve menos).
//     En cuanto el buzón histórico pase de 1,000 solicitudes, el sync empezaría
//     a creer que solicitudes viejas son nuevas y chocaría contra la llave
//     primaria en cada corrida. Ahora se pagina y se verifica contra count(*):
//     si la lectura sale corta, la corrida aborta antes de escribir.
//     Además: la búsqueda de duplicado por teléfono no filtraba por oficina,
//     lo que en multi-oficina podía mezclar carteras.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EB_BASE = "https://api.easybroker.com/v1";
const EB_KEY = Deno.env.get("EASYBROKER_API_KEY") ?? "";
const DIAS_DEFAULT = Number(Deno.env.get("SYNC_DIAS_VENTANA") ?? "30");
const AGENCIA = Deno.env.get("AGENCIA_ID") ?? "default";
const PAGINA_DB = 1000;

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

const normTel = (t?: string | null) => {
  const d = (t ?? "").replace(/[^0-9]/g, "");
  return d.length >= 10 ? d.slice(-10) : (d || null);
};

// Lee una tabla completa en páginas de 1,000, con orden estable.
async function leerTodo(tabla: string, columnas: string, filtro: (q: any) => any) {
  const filas: any[] = [];
  for (let desde = 0; ; desde += PAGINA_DB) {
    const q = await filtro(sb.from(tabla).select(columnas))
      .order("id", { ascending: true })
      .range(desde, desde + PAGINA_DB - 1);
    if (q.error) throw new Error(`${tabla}: ${q.error.message}`);
    const lote = q.data ?? [];
    filas.push(...lote);
    if (lote.length < PAGINA_DB) break;
    if (desde > 200_000) throw new Error(`${tabla}: paginación fuera de control`);
  }
  return filas;
}

Deno.serve(async (req) => {
  const corridaEn = new Date().toISOString();
  const bitacora: any[] = [];
  const dias = Number(new URL(req.url).searchParams.get("dias") ?? DIAS_DEFAULT) || DIAS_DEFAULT;
  const r = { revisadas: 0, creadas: 0, ya_estaban: 0, duplicados: 0, para_revision: 0, errores: [] as string[] };

  try {
    if (!EB_KEY) throw new Error("Falta el secreto EASYBROKER_API_KEY en el proyecto de Supabase.");

    // Asesor de respaldo: el broker con login real. Ningún lead queda sin dueño
    // y ninguno cae en una cuenta demo a la que nadie entra.
    const brokersQ = await sb.from("usuarios").select("id, auth_id")
      .eq("agencia_id", AGENCIA).eq("rol", "broker").eq("estado_cuenta", "Activo").order("id");
    const brokers = brokersQ.data ?? [];
    const brokerId: string | null =
      (brokers.find((b: any) => b.auth_id) ?? brokers[0])?.id ?? null;

    const desde = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);

    const solicitudes: any[] = [];
    for (let page = 1; page <= 60; page++) {
      const data = await eb(`/contact_requests?happened_after=${desde}&page=${page}&limit=50`);
      solicitudes.push(...(data.content ?? []));
      if (!data.pagination?.next_page) break;
    }
    solicitudes.sort((a, b) => String(a.happened_at).localeCompare(String(b.happened_at)));
    r.revisadas = solicitudes.length;

    const propsQ = await sb.from("propiedades").select("id, eb_public_id, asesor_id")
      .eq("agencia_id", AGENCIA).not("eb_public_id", "is", null);
    if (propsQ.error) throw new Error(`propiedades: ${propsQ.error.message}`);
    const porEbId = new Map<string, any>();
    for (const p of propsQ.data ?? []) porEbId.set(p.eb_public_id, p);

    // PAGINADO Y VERIFICADO: si esta lectura sale corta, el sync creería que
    // solicitudes ya procesadas son nuevas y chocaría contra la PK en bucle.
    const totalQ = await sb.from("leads").select("id", { count: "exact", head: true })
      .eq("agencia_id", AGENCIA).not("eb_contact_request_id", "is", null);
    if (totalQ.error) throw new Error(`conteo de leads: ${totalQ.error.message}`);
    const procesadas = await leerTodo(
      "leads", "id, eb_contact_request_id",
      (q: any) => q.eq("agencia_id", AGENCIA).not("eb_contact_request_id", "is", null),
    );
    if (procesadas.length < (totalQ.count ?? 0)) {
      throw new Error(
        `Lectura incompleta de solicitudes ya procesadas (${procesadas.length} de ${totalQ.count}). ` +
        `Se aborta la corrida para no duplicar.`,
      );
    }
    const yaProcesadas = new Set(procesadas.map((x: any) => Number(x.eb_contact_request_id)));

    for (const cr of solicitudes) {
      const crId = Number(cr.id);
      const tel = normTel(cr.phone);
      const ebProp = cr.property_id ?? null;
      const base = { agencia_id: AGENCIA, proceso: "sync-leads", corrida_en: corridaEn, fuente: cr.source ?? null,
                     eb_contact_request_id: crId, eb_property_id: ebProp, telefono_norm: tel };

      try {
        if (!Number.isFinite(crId)) { bitacora.push({ ...base, resultado: "error", detalle: "solicitud sin id" }); continue; }

        if (yaProcesadas.has(crId)) {
          r.ya_estaban++;
          bitacora.push({ ...base, resultado: "ya_procesado", detalle: null });
          continue;
        }

        const prop = ebProp ? porEbId.get(ebProp) : null;

        // Duplicado = mismo teléfono por la MISMA propiedad, en la MISMA oficina.
        // Mismo teléfono por OTRA propiedad es un interés nuevo.
        if (tel) {
          const dupQ = await sb.from("leads").select("id, nota")
            .eq("agencia_id", AGENCIA)
            .eq("telefono_norm", tel).eq("eb_property_id", ebProp ?? "").limit(1).maybeSingle();
          if (dupQ.data?.id) {
            const extra = `\n[${String(cr.happened_at).slice(0, 16)} · ${cr.source ?? "?"}] ${cr.message ?? ""}`.trim();
            await sb.from("leads").update({ nota: `${dupQ.data.nota ?? ""}${extra}`.slice(0, 8000) })
              .eq("id", dupQ.data.id);
            r.duplicados++;
            bitacora.push({ ...base, resultado: "duplicado_nota_agregada", detalle: `lead ${dupQ.data.id}` });
            continue;
          }
        }

        const asesorId = prop?.asesor_id ?? brokerId;
        const motivos: string[] = [];
        if (!ebProp) motivos.push("la solicitud no trae propiedad");
        else if (!prop) motivos.push(`propiedad ${ebProp} no está en el catálogo (corre sync-propiedades)`);
        if (prop && !prop.asesor_id) motivos.push("la propiedad no tiene asesor asignado");
        if (!tel) motivos.push("sin teléfono");

        const ins = await sb.from("leads").insert({
          id: `eb-${crId}`,
          agencia_id: AGENCIA,
          nombre: cr.name || "Sin nombre",
          telefono: cr.phone || "",
          correo: (cr.email ?? "").toLowerCase(),
          etapa: "Nuevo",
          origen: "Portal",
          interes_propiedad_id: prop?.id ?? null,
          eb_property_id: ebProp,
          eb_contact_id: cr.contact_id ?? null,
          asesor_id: asesorId,
          creado: cr.happened_at ?? corridaEn,
          nota: `[${cr.source ?? "?"}] ${cr.message ?? ""}`.trim(),
          telefono_norm: tel,
          eb_contact_request_id: crId,
          requiere_revision: motivos.length > 0,
          motivo_revision: motivos.length ? motivos.join("; ") : null,
        });

        if (ins.error) throw new Error(ins.error.message);
        yaProcesadas.add(crId);
        r.creadas++;
        if (motivos.length) r.para_revision++;
        bitacora.push({ ...base, resultado: motivos.length ? "creado_para_revision" : "creado",
                        detalle: motivos.join("; ") || null });
      } catch (e) {
        r.errores.push(`cr ${crId}: ${(e as Error).message}`);
        bitacora.push({ ...base, resultado: "error", detalle: (e as Error).message.slice(0, 400) });
      }
    }

    if (bitacora.length) {
      for (let i = 0; i < bitacora.length; i += 200) {
        const lg = await sb.from("ingesta_log").insert(bitacora.slice(i, i + 200));
        if (lg.error) { r.errores.push(`ingesta_log: ${lg.error.message}`); break; }
      }
    }

    const salida = { ok: r.errores.length === 0, ventana_dias: dias,
                     asesor_respaldo: brokerId, ...r, errores: r.errores.slice(0, 20) };

    // PK de sync_estado = (agencia_id, proceso). Y el error se revisa: si esto
    // falla en silencio, el semáforo miente y el sync puede morir sin avisar.
    const est = await sb.from("sync_estado").upsert({
      agencia_id: AGENCIA,
      proceso: "leads_easybroker",
      ultimo_corte: new Date().toISOString(),
      ultima_corrida: corridaEn,
      ultimo_resultado: JSON.stringify(salida).slice(0, 2000),
      actualizado_en: new Date().toISOString(),
    }, { onConflict: "agencia_id,proceso" });
    if (est.error) salida.errores.push(`sync_estado: ${est.error.message}`);

    return new Response(JSON.stringify(salida, null, 2), {
      headers: { "Content-Type": "application/json" }, status: salida.ok ? 200 : 207,
    });
  } catch (e) {
    const err = { ok: false, error: (e as Error).message };
    await sb.from("sync_estado").upsert({
      agencia_id: AGENCIA,
      proceso: "leads_easybroker",
      ultimo_corte: new Date().toISOString(),
      ultima_corrida: corridaEn,
      ultimo_resultado: JSON.stringify(err),
      actualizado_en: new Date().toISOString(),
    }, { onConflict: "agencia_id,proceso" });
    return new Response(JSON.stringify(err, null, 2), {
      headers: { "Content-Type": "application/json" }, status: 500,
    });
  }
});

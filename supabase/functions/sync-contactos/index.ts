// ============================================================
// sync-contactos  (v1 - 20 ago 2026)
//
// POR QUE EXISTE:
// La app vivia solo de /contact_requests (el buzon de portales). Pero el
// grueso del CRM son contactos CAPTURADOS A MANO por los asesores, que nunca
// generaron una solicitud de portal y por lo tanto eran invisibles para la
// plataforma. Medido contra la API real: 1,260 contactos vs 524 solicitudes.
// Faltaba mas de la mitad del activo comercial.
//
// QUE SI DA /v1/contacts:
//   lista:   id, full_name, email, phone, agent (nombre), source,
//            created_at, updated_at
//   detalle: + first/last_name, title, company, private_description,
//            tags[], probability, phones[], emails[], addresses[],
//            agent{id,name,email,mobile_phone}
// QUE NO DA:
//   propiedad de interes, etapa del pipeline, notas de seguimiento,
//   historial de actividad, ofertas. Eso solo vive dentro de EasyBroker.
//   El UNICO puente contacto <-> propiedad es contact_requests.contact_id.
//
// POR ESO se marcan es_directorio = true: entran a la lista de Clientes,
// pero no al conteo de "pendientes por atender". Si un contacto SI tiene
// actividad de portal, ya existe como lead y aqui solo se le pega el
// eb_contact_id - no se duplica.
//
// No pide el detalle de los 1,260 (serian 1,260 llamadas). Con ?detalle=1
// si lo hace, para traer tags y probabilidad.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EB_BASE = "https://api.easybroker.com/v1";
const EB_KEY = Deno.env.get("EASYBROKER_API_KEY") ?? "";
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
  if (!r.ok) throw new Error(`EasyBroker ${path} respondio ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const normTel = (t?: string | null) => {
  const d = (t ?? "").replace(/[^0-9]/g, "");
  return d.length >= 10 ? d.slice(-10) : (d || null);
};

const normNombre = (s?: string | null) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

Deno.serve(async (req) => {
  const corridaEn = new Date().toISOString();
  const conDetalle = new URL(req.url).searchParams.get("detalle") === "1";
  const r = {
    revisados: 0, creados: 0, ya_estaban: 0,
    vinculados_a_lead_existente: 0, sin_asesor: 0, sin_telefono: 0,
    errores: [] as string[],
  };

  try {
    if (!EB_KEY) throw new Error("Falta el secreto EASYBROKER_API_KEY.");

    // --- Mapa de asesores -------------------------------------------------
    // La lista de contactos solo trae el NOMBRE del asesor, no su id ni su
    // correo. /users si trae el correo, que es como la plataforma vincula.
    const users = await eb("/users?limit=50");
    const correoPorNombre = new Map<string, string>();
    for (const u of users.content ?? []) {
      const nom = normNombre(`${u.first_name ?? ""} ${u.last_name ?? ""}`);
      if (nom && u.email) correoPorNombre.set(nom, String(u.email).toLowerCase());
    }

    const usuariosQ = await sb.from("usuarios").select("id, correo, nombre").eq("agencia_id", AGENCIA);
    const idPorCorreo = new Map<string, string>();
    const idPorNombre = new Map<string, string>();
    for (const u of usuariosQ.data ?? []) {
      if (u.correo) idPorCorreo.set(String(u.correo).toLowerCase(), u.id);
      if (u.nombre) idPorNombre.set(normNombre(u.nombre), u.id);
    }

    const brokersQ = await sb.from("usuarios").select("id, auth_id")
      .eq("agencia_id", AGENCIA).eq("rol", "broker").eq("estado_cuenta", "Activo").order("id");
    const brokers = brokersQ.data ?? [];
    const brokerId: string | null = (brokers.find((b: any) => b.auth_id) ?? brokers[0])?.id ?? null;

    const resolverAsesor = (nombreAgente?: string | null): string | null => {
      const nom = normNombre(nombreAgente);
      if (!nom) return brokerId;
      const correo = correoPorNombre.get(nom);
      if (correo && idPorCorreo.has(correo)) return idPorCorreo.get(correo)!;
      if (idPorNombre.has(nom)) return idPorNombre.get(nom)!;
      // Coincidencia por nombre de pila + primer apellido (EasyBroker a veces
      // guarda "Lulu Zanabria" y la plataforma "Lulu Zanabria Martinez").
      const partes = nom.split(" ");
      if (partes.length >= 2) {
        const corto = `${partes[0]} ${partes[1]}`;
        for (const [k, v] of idPorNombre) if (k.startsWith(corto)) return v;
      }
      return brokerId;
    };

    // --- Lo que ya existe en la plataforma --------------------------------
    const existentesQ = await sb.from("leads")
      .select("id, eb_contact_id, telefono_norm, correo").eq("agencia_id", AGENCIA);
    const porContactId = new Map<number, string>();
    const porTelefono = new Map<string, string>();
    for (const l of existentesQ.data ?? []) {
      if (l.eb_contact_id != null) porContactId.set(Number(l.eb_contact_id), l.id);
      if (l.telefono_norm) porTelefono.set(l.telefono_norm, l.id);
    }

    // --- Contactos de EasyBroker ------------------------------------------
    const contactos: any[] = [];
    for (let page = 1; page <= 60; page++) {
      const data = await eb(`/contacts?page=${page}&limit=50`);
      contactos.push(...(data.content ?? []));
      if (!data.pagination?.next_page) break;
      await new Promise((res) => setTimeout(res, 120)); // limite 20 req/s
    }
    r.revisados = contactos.length;

    const nuevos: any[] = [];

    for (const c of contactos) {
      try {
        const cid = Number(c.id);
        if (!Number.isFinite(cid)) continue;

        if (porContactId.has(cid)) { r.ya_estaban++; continue; }

        const tel = normTel(c.phone);
        if (!tel) r.sin_telefono++;

        // Ya lo tenemos como lead de portal: no duplicar, solo tender el puente.
        if (tel && porTelefono.has(tel)) {
          const leadId = porTelefono.get(tel)!;
          const up = await sb.from("leads").update({ eb_contact_id: cid }).eq("id", leadId);
          if (up.error) throw new Error(up.error.message);
          porContactId.set(cid, leadId);
          r.vinculados_a_lead_existente++;
          continue;
        }

        let extra: Record<string, unknown> = {};
        if (conDetalle) {
          const d = await eb(`/contacts/${cid}`);
          const etiquetas = (d.tags ?? []).filter((t: unknown) => typeof t === "string");
          extra = {
            nota: [
              d.private_description ? `Descripcion: ${d.private_description}` : null,
              d.company ? `Empresa: ${d.company}` : null,
              etiquetas.length ? `Etiquetas: ${etiquetas.join(", ")}` : null,
              d.probability ? `Probabilidad EasyBroker: ${d.probability}` : null,
            ].filter(Boolean).join(" - "),
          };
          await new Promise((res) => setTimeout(res, 60));
        }

        const asesorId = resolverAsesor(c.agent);
        if (!asesorId) r.sin_asesor++;

        nuevos.push({
          id: `ebc-${cid}`,
          agencia_id: AGENCIA,
          nombre: c.full_name || "Sin nombre",
          telefono: c.phone || "",
          correo: (c.email ?? "").toLowerCase(),
          // "Contactado", no "Nuevo": son contactos que el asesor YA trabajo en
          // EasyBroker. Marcarlos como Nuevo los volveria pendientes falsos.
          etapa: "Contactado",
          origen: "Directo",
          interes_propiedad_id: null,
          eb_property_id: null,
          eb_contact_id: cid,
          asesor_id: asesorId,
          creado: c.created_at ?? corridaEn,
          telefono_norm: tel,
          es_directorio: true,
          requiere_revision: false,
          nota: `[Directorio EasyBroker${c.source ? ` - ${c.source}` : ""}]`,
          ...extra,
        });

        porContactId.set(cid, `ebc-${cid}`);
        if (tel) porTelefono.set(tel, `ebc-${cid}`);
      } catch (e) {
        r.errores.push(`contacto ${c?.id}: ${(e as Error).message}`.slice(0, 300));
      }
    }

    for (let i = 0; i < nuevos.length; i += 200) {
      const ins = await sb.from("leads").upsert(nuevos.slice(i, i + 200), { onConflict: "id" });
      if (ins.error) r.errores.push(`lote ${i}: ${ins.error.message}`.slice(0, 300));
      else r.creados += nuevos.slice(i, i + 200).length;
    }

    const salida = { ok: r.errores.length === 0, con_detalle: conDetalle, ...r, errores: r.errores.slice(0, 20) };

    const est = await sb.from("sync_estado").upsert({
      agencia_id: AGENCIA,
      proceso: "contactos_easybroker",
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
      agencia_id: AGENCIA, proceso: "contactos_easybroker",
      ultimo_corte: new Date().toISOString(), ultima_corrida: corridaEn,
      ultimo_resultado: JSON.stringify(err), actualizado_en: new Date().toISOString(),
    }, { onConflict: "agencia_id,proceso" });
    return new Response(JSON.stringify(err, null, 2), {
      headers: { "Content-Type": "application/json" }, status: 500,
    });
  }
});

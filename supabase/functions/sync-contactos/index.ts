// ============================================================
// sync-contactos  (v3 — 21 ago 2026)
//
// QUÉ ARREGLA v3 (dos cosas que hacían que la app y EasyBroker no cuadraran):
//
// A) EL ASESOR LO MANDA EL CRM, SIEMPRE.
//    v2 solo reasignaba el asesor en los contactos de directorio, y cuando no
//    lograba resolver el agente devolvía "el broker" como respaldo. Resultado:
//    120 leads acabaron colgados de una cuenta que ni siquiera existe en
//    EasyBroker, y las métricas por asesor mentían. Ahora:
//      - si EasyBroker resuelve el agente, ese agente gana (en directorio y en
//        embudo por igual);
//      - si no lo resuelve, el lead queda SIN asesor y visible, no escondido
//        en el buzón del broker.
//
// B) RECONCILIACIÓN EN LOS DOS SENTIDOS.
//    El sync era de ida nada más: un contacto borrado en EasyBroker se quedaba
//    para siempre en la plataforma. Cada corrida sella `eb_visto_en` en todo
//    lo que el CRM devolvió y marca `fuera_de_crm` en lo que dejó de devolver.
//    Con eso el conteo de la app se puede cuadrar contra el del CRM.
//    Salvaguarda: si EasyBroker devuelve menos del 70% de los contactos de la
//    corrida anterior (caída parcial, rate limit), NO se marca nada — antes que
//    dar de baja medio CRM por un error de red, se prefiere no reconciliar.
//
// ------------------------------------------------------------
// v2 (20 ago 2026)
//
// QUÉ ARREGLA v2 (dos fallas que se comían la actualización del CRM):
//
// 1) LECTURA TRUNCADA A 1,000 FILAS.
//    v1 hacía `select("id, eb_contact_id, ...")` sin paginar. PostgREST corta
//    en 1,000 filas por respuesta. Con 1,289 leads, el mapa de "lo que ya
//    existe" nacía incompleto: ~289 contactos parecían nuevos en cada corrida
//    y se volvían a insertar con upsert(onConflict:"id"), PISANDO la etapa, la
//    nota y el asesor que el asesor había capturado a mano. Cada mañana a las
//    7:30. Ahora se pagina de 1,000 en 1,000 y, además, se compara contra un
//    count(*) real: si no cuadra, la corrida ABORTA antes de escribir nada.
//
// 2) ERA CREATE-ONLY.
//    Si el contacto ya existía, v1 hacía `continue`. Un teléfono o un correo
//    corregido en EasyBroker jamás llegaba a la plataforma. Ahora hay modo
//    actualización con una regla explícita de propiedad del dato:
//
//      EasyBroker manda en:  nombre, teléfono, correo, asesor asignado.
//      La plataforma manda en: etapa, BANT, notas del asesor, historial,
//                              propiedad de interés, banderas de revisión.
//
//    Nunca se escribe `creado` de una fila existente (movía el lead a "hoy" y
//    rompía el orden por más reciente).
//
// Para no reescribir 1,260 filas cada corrida se usa `updated_at` de EasyBroker
// como cursor por contacto, guardado en leads.eb_actualizado_en (migración 11).
//
// QUÉ SÍ DA /v1/contacts:
//   lista:   id, full_name, email, phone, agent (nombre), source,
//            created_at, updated_at
//   detalle: + company, private_description, tags[], probability, phones[]...
// QUÉ NO DA:
//   propiedad de interés, etapa del pipeline, notas de seguimiento, webhooks.
//   El ÚNICO puente contacto <-> propiedad es contact_requests.contact_id.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EB_BASE = "https://api.easybroker.com/v1";
const EB_KEY = Deno.env.get("EASYBROKER_API_KEY") ?? "";
const AGENCIA = Deno.env.get("AGENCIA_ID") ?? "default";
const PAGINA_DB = 1000; // tope duro de PostgREST por respuesta

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

async function eb(path: string): Promise<any> {
  const r = await fetch(`${EB_BASE}${path}`, {
    headers: { "X-Authorization": EB_KEY, accept: "application/json" },
  });
  if (!r.ok) throw new Error(`EasyBroker ${path} respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const normTel = (t?: string | null) => {
  const d = (t ?? "").replace(/[^0-9]/g, "");
  return d.length >= 10 ? d.slice(-10) : (d || null);
};

const normNombre = (s?: string | null) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

// Lee una tabla completa en páginas de 1,000. La razón de existir de v2.
async function leerTodo(tabla: string, columnas: string, filtro: (q: any) => any) {
  const filas: any[] = [];
  for (let desde = 0; ; desde += PAGINA_DB) {
    // El .order("id") no es cosmético: sin un orden estable, PostgREST puede
    // devolver la misma fila en dos páginas y saltarse otra.
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

  const corridaEn = new Date().toISOString();
  const url = new URL(req.url);
  const conDetalle = url.searchParams.get("detalle") === "1";
  const forzar = url.searchParams.get("forzar") === "1"; // ignora el cursor updated_at
  const r = {
    revisados: 0, creados: 0, actualizados: 0, sin_cambio: 0,
    vinculados_a_lead_existente: 0, sin_asesor: 0, sin_telefono: 0,
    reasignados: 0, salieron_del_crm: 0, regresaron_al_crm: 0,
    reconciliado: false, errores: [] as string[],
  };

  try {
    if (!EB_KEY) throw new Error("Falta el secreto EASYBROKER_API_KEY.");

    // --- Mapa de asesores -------------------------------------------------
    const users = await eb("/users?limit=50");
    const correoPorNombre = new Map<string, string>();
    for (const u of users.content ?? []) {
      const nom = normNombre(`${u.first_name ?? ""} ${u.last_name ?? ""}`);
      if (nom && u.email) correoPorNombre.set(nom, String(u.email).toLowerCase());
    }

    const usuariosQ = await sb.from("usuarios").select("id, correo, nombre").eq("agencia_id", AGENCIA);
    if (usuariosQ.error) throw new Error(`usuarios: ${usuariosQ.error.message}`);
    const idPorCorreo = new Map<string, string>();
    const idPorNombre = new Map<string, string>();
    for (const u of usuariosQ.data ?? []) {
      if (u.correo) idPorCorreo.set(String(u.correo).toLowerCase(), u.id);
      if (u.nombre) idPorNombre.set(normNombre(u.nombre), u.id);
    }

    // Sin asesor de respaldo. Antes, cuando no se lograba resolver el agente,
    // esta función devolvía al broker: el lead quedaba con dueño en la base y
    // sin dueño en la realidad. Devolver null es peor de ver y mejor de operar
    // — el lead sale en la bandeja de "sin asignar" y alguien lo reparte.
    const resolverAsesor = (nombreAgente?: string | null): string | null => {
      const nom = normNombre(nombreAgente);
      if (!nom) return null;
      const correo = correoPorNombre.get(nom);
      if (correo && idPorCorreo.has(correo)) return idPorCorreo.get(correo)!;
      if (idPorNombre.has(nom)) return idPorNombre.get(nom)!;
      const partes = nom.split(" ");
      if (partes.length >= 2) {
        const corto = `${partes[0]} ${partes[1]}`;
        for (const [k, v] of idPorNombre) if (k.startsWith(corto)) return v;
      }
      return null;
    };

    // --- Lo que ya existe en la plataforma (PAGINADO Y VERIFICADO) --------
    const totalQ = await sb.from("leads").select("id", { count: "exact", head: true })
      .eq("agencia_id", AGENCIA);
    if (totalQ.error) throw new Error(`conteo de leads: ${totalQ.error.message}`);
    const totalEsperado = totalQ.count ?? 0;

    const existentes = await leerTodo(
      "leads",
      "id, eb_contact_id, telefono_norm, correo, nombre, telefono, asesor_id, eb_actualizado_en, es_directorio, fuera_de_crm",
      (q: any) => q.eq("agencia_id", AGENCIA),
    );

    // Salvavidas: si la lectura no trae TODO, cualquier contacto no leído
    // parecería nuevo y el upsert pisaría el trabajo del asesor. Mejor no correr.
    if (existentes.length < totalEsperado) {
      throw new Error(
        `Lectura incompleta de leads (${existentes.length} de ${totalEsperado}). ` +
        `Se aborta la corrida para no duplicar ni sobrescribir.`,
      );
    }

    const porContactId = new Map<number, any>();
    const porTelefono = new Map<string, any>();
    for (const l of existentes) {
      if (l.eb_contact_id != null) porContactId.set(Number(l.eb_contact_id), l);
      if (l.telefono_norm && !porTelefono.has(l.telefono_norm)) porTelefono.set(l.telefono_norm, l);
    }

    // --- Contactos de EasyBroker ------------------------------------------
    const contactos: any[] = [];
    for (let page = 1; page <= 80; page++) {
      const data = await eb(`/contacts?page=${page}&limit=50`);
      contactos.push(...(data.content ?? []));
      if (!data.pagination?.next_page) break;
      await new Promise((res) => setTimeout(res, 120)); // límite 20 req/s
    }
    r.revisados = contactos.length;

    const nuevos: any[] = [];
    // Todo contacto que EasyBroker devolvió en ESTA corrida. Es la base de la
    // reconciliación: lo que no está aquí, ya no está en el CRM.
    const vistos = new Set<number>();

    for (const c of contactos) {
      try {
        const cid = Number(c.id);
        if (!Number.isFinite(cid)) continue;
        vistos.add(cid);

        const tel = normTel(c.phone);
        if (!tel) r.sin_telefono++;
        const sello = c.updated_at ?? c.created_at ?? null;

        // ---- Ya existe: ACTUALIZAR datos de contacto, jamás el embudo ----
        const yaEsta = porContactId.get(cid);
        if (yaEsta) {
          const selloPrevio = yaEsta.eb_actualizado_en ? new Date(yaEsta.eb_actualizado_en).getTime() : 0;
          const selloNuevo = sello ? new Date(sello).getTime() : 0;
          if (!forzar && selloNuevo && selloNuevo <= selloPrevio) { r.sin_cambio++; continue; }

          const asesorId = resolverAsesor(c.agent);
          const cambios: Record<string, unknown> = { eb_actualizado_en: sello };
          if (c.full_name && c.full_name !== yaEsta.nombre) cambios.nombre = c.full_name;
          if (c.phone && c.phone !== yaEsta.telefono) { cambios.telefono = c.phone; cambios.telefono_norm = tel; }
          const correoEb = (c.email ?? "").toLowerCase();
          if (correoEb && correoEb !== (yaEsta.correo ?? "")) cambios.correo = correoEb;
          // El asesor lo manda EasyBroker, en directorio y en embudo. Si el CRM
          // no resuelve agente (asesorId null) NO se toca lo que ya había: se
          // respeta el reparto manual, pero el CRM nunca pierde contra él.
          if (asesorId && asesorId !== yaEsta.asesor_id) {
            cambios.asesor_id = asesorId;
            r.reasignados++;
          }

          const hayCambioReal = Object.keys(cambios).length > 1;
          const up = await sb.from("leads").update(cambios).eq("id", yaEsta.id);
          if (up.error) throw new Error(up.error.message);
          Object.assign(yaEsta, cambios);
          if (hayCambioReal) r.actualizados++; else r.sin_cambio++;
          continue;
        }

        // ---- No trae contact_id pero el teléfono ya está: tender el puente --
        if (tel && porTelefono.has(tel)) {
          const lead = porTelefono.get(tel);
          const up = await sb.from("leads")
            .update({ eb_contact_id: cid, eb_actualizado_en: sello }).eq("id", lead.id);
          if (up.error) throw new Error(up.error.message);
          lead.eb_contact_id = cid;
          porContactId.set(cid, lead);
          r.vinculados_a_lead_existente++;
          continue;
        }

        // ---- Contacto nuevo --------------------------------------------
        let extra: Record<string, unknown> = {};
        if (conDetalle) {
          const d = await eb(`/contacts/${cid}`);
          const etiquetas = (d.tags ?? []).filter((t: unknown) => typeof t === "string");
          extra = {
            nota: [
              d.private_description ? `Descripción: ${d.private_description}` : null,
              d.company ? `Empresa: ${d.company}` : null,
              etiquetas.length ? `Etiquetas: ${etiquetas.join(", ")}` : null,
              d.probability ? `Probabilidad EasyBroker: ${d.probability}` : null,
            ].filter(Boolean).join(" · "),
          };
          await new Promise((res) => setTimeout(res, 60));
        }

        const asesorId = resolverAsesor(c.agent);
        if (!asesorId) r.sin_asesor++;

        const fila = {
          id: `ebc-${cid}`,
          agencia_id: AGENCIA,
          nombre: c.full_name || "Sin nombre",
          telefono: c.phone || "",
          correo: (c.email ?? "").toLowerCase(),
          // "Contactado", no "Nuevo": son contactos que el asesor YA trabajó en
          // EasyBroker. Marcarlos como Nuevo los volvería pendientes falsos.
          etapa: "Contactado",
          origen: "Directo",
          interes_propiedad_id: null,
          eb_property_id: null,
          eb_contact_id: cid,
          eb_actualizado_en: sello,
          asesor_id: asesorId,
          creado: c.created_at ?? corridaEn,
          telefono_norm: tel,
          es_directorio: true,
          requiere_revision: false,
          nota: `[Directorio EasyBroker${c.source ? ` · ${c.source}` : ""}]`,
          ...extra,
        };
        nuevos.push(fila);
        porContactId.set(cid, fila);
        if (tel) porTelefono.set(tel, fila);
      } catch (e) {
        r.errores.push(`contacto ${c?.id}: ${(e as Error).message}`.slice(0, 300));
      }
    }

    // insert, no upsert: a estas alturas ya sabemos que son nuevos de verdad.
    // Si algo se coló, queremos el error, no una sobrescritura silenciosa.
    for (let i = 0; i < nuevos.length; i += 200) {
      const lote = nuevos.slice(i, i + 200);
      const ins = await sb.from("leads").insert(lote);
      if (ins.error) r.errores.push(`lote ${i}: ${ins.error.message}`.slice(0, 300));
      else r.creados += lote.length;
    }

    // --- Reconciliación app <-> CRM ---------------------------------------
    // Salvaguarda antes de tocar nada: si la API devolvió mucho menos de lo que
    // devolvió la última vez, lo más probable es que se haya caído a media
    // paginación. Dar de baja 400 contactos por eso sería peor que no
    // reconciliar, así que se reporta y se sale sin marcar.
    const previoQ = await sb.from("leads")
      .select("id", { count: "exact", head: true })
      .eq("agencia_id", AGENCIA).eq("fuera_de_crm", false).not("eb_contact_id", "is", null);
    const vigentesAntes = previoQ.count ?? 0;
    const suficiente = vistos.size > 0 && (vigentesAntes === 0 || vistos.size >= vigentesAntes * 0.7);

    if (!suficiente) {
      r.errores.push(
        `Reconciliación omitida: EasyBroker devolvió ${vistos.size} contactos y la corrida anterior ` +
        `dejó ${vigentesAntes} vigentes. Se sospecha respuesta incompleta.`,
      );
    } else if (r.errores.length === 0) {
      const ids = [...vistos];
      // Se cuenta ANTES de limpiar la marca: después del update de (a) ya
      // nadie tendría fuera_de_crm = true y el contador saldría siempre en 0.
      for (const cid of vistos) {
        if (porContactId.get(cid)?.fuera_de_crm === true) r.regresaron_al_crm++;
      }
      // a) Sellar lo visto y devolver al CRM lo que hubiera estado marcado.
      for (let i = 0; i < ids.length; i += 500) {
        const lote = ids.slice(i, i + 500);
        const up = await sb.from("leads")
          .update({ eb_visto_en: corridaEn, fuera_de_crm: false })
          .eq("agencia_id", AGENCIA).in("eb_contact_id", lote);
        if (up.error) { r.errores.push(`sello eb_visto_en: ${up.error.message}`); break; }
      }
      // b) Marcar lo que el CRM ya no devuelve. Solo leads que ALGUNA VEZ
      //    vinieron de un contacto de EasyBroker: los capturados en la app a
      //    mano no tienen por qué existir allá.
      if (r.errores.length === 0) {
        const baja = await sb.from("leads")
          .update({ fuera_de_crm: true })
          .eq("agencia_id", AGENCIA)
          .eq("fuera_de_crm", false)
          .not("eb_contact_id", "is", null)
          .or(`eb_visto_en.is.null,eb_visto_en.lt.${corridaEn}`)
          .select("id");
        if (baja.error) r.errores.push(`baja fuera_de_crm: ${baja.error.message}`);
        else { r.salieron_del_crm = baja.data?.length ?? 0; r.reconciliado = true; }
      }
    }

    const salida = { ok: r.errores.length === 0, con_detalle: conDetalle, forzado: forzar, ...r, errores: r.errores.slice(0, 20) };

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

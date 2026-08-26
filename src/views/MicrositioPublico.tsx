// Micrositio público del asesor: sin sesión, por slug opaco.
//
// Mismo patrón que PublicSharedDocument (feed ICS de Agenda, "compartir
// ficha técnica"): la app pública llama a una Edge Function con
// verify_jwt = false, que a su vez llama a una función de la base con
// EXECUTE revocado a anon/authenticated — nunca se expone la base
// directamente a un visitante sin sesión.
//
// Decisión de Jean (26 ago 2026): el micrositio siempre está activo, con o
// sin datos de marca cargados. `perfilCompleto` en la respuesta le dice a
// esta pantalla si debe mostrar secciones vacías con un tono discreto en
// vez de aparentar que falta cargar algo — nunca se bloquea la página.
import { useEffect, useState } from "react";
import {
  Award, Building2, Globe2, Instagram, Languages, Linkedin, LoaderCircle, MapPin, ServerCrash,
} from "lucide-react";
import { MarcaHomeID } from "../components/LogoHomeID";
import { formatoMXN } from "../types";
import { telefonoWhatsApp } from "../lib/whatsapp";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../lib/supabaseClient";

interface RedSocial { red: string; url: string; }
interface PropiedadPublica {
  id: string; titulo: string; precio: number; ubicacion: string; municipio: string;
  recamaras: number; banos: number; m2: number; imagen: string | null; eb_public_url: string | null;
}
interface PerfilPublico {
  nombre: string; puesto: string; foto_url: string | null; bio_corta: string | null;
  especialidades: string[]; anos_experiencia: number | null; idiomas: string[];
  certificaciones: string[]; redes_sociales: RedSocial[]; telefono: string;
  perfil_completo: boolean;
  oficina: { nombre: string; logo_url: string | null; sitio_web: string | null };
  propiedades: PropiedadPublica[];
}

interface Props { slug: string; }

const ICONO_RED: Record<string, typeof Instagram> = { instagram: Instagram, linkedin: Linkedin };

export default function MicrositioPublico({ slug }: Props) {
  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        setError("Este micrositio no está disponible.");
        return;
      }
      try {
        const respuesta = await fetch(
          `${SUPABASE_URL}/functions/v1/micrositio-publico?slug=${encodeURIComponent(slug)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } },
        );
        if (!respuesta.ok) {
          if (!cancelado) setError("No encontramos este micrositio.");
          return;
        }
        const datos = (await respuesta.json()) as PerfilPublico;
        if (!cancelado) setPerfil(datos);
      } catch {
        if (!cancelado) setError("No pudimos abrir el micrositio. Revisa tu conexión.");
      }
    };
    void cargar();
    return () => {
      cancelado = true;
    };
  }, [slug]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm text-center">
          <ServerCrash className="mx-auto size-10 text-slate-300" />
          <h1 className="mt-4 text-lg font-bold text-slate-900">{error}</h1>
          <p className="mt-2 text-sm text-slate-500">Verifica el enlace con la persona que te lo compartió.</p>
        </div>
      </main>
    );
  }

  if (!perfil) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div role="status" className="flex items-center gap-2 text-sm text-slate-400">
          <LoaderCircle className="size-5 animate-spin" /> Abriendo micrositio…
        </div>
      </main>
    );
  }

  const whatsapp = telefonoWhatsApp(perfil.telefono);
  const enlaceWhatsApp = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola ${perfil.nombre.split(" ")[0]}, vi tu micrositio y me gustaría contactarte.`)}`
    : null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-violet-50 via-white to-white">
      {/* ---------- Hero ---------- */}
      <section className="mx-auto max-w-3xl px-4 pb-8 pt-10 text-center sm:px-6">
        {perfil.foto_url ? (
          <img
            src={perfil.foto_url}
            alt={perfil.nombre}
            className="mx-auto size-28 rounded-full object-cover shadow-lg shadow-violet-200/60"
          />
        ) : (
          <span className="mx-auto flex size-28 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 text-3xl font-bold text-white shadow-lg shadow-violet-200/60">
            {perfil.nombre.split(/\s+/).slice(0, 2).map((p) => p[0] ?? "").join("").toUpperCase()}
          </span>
        )}
        <h1 className="mt-4 text-2xl font-bold text-slate-900">{perfil.nombre}</h1>
        <p className="text-sm font-semibold text-violet-700">{perfil.puesto}</p>
        <p className="mt-1 flex items-center justify-center gap-1 text-xs text-slate-500">
          <Building2 className="size-3.5" /> {perfil.oficina.nombre}
        </p>

        {perfil.bio_corta && (
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-600">{perfil.bio_corta}</p>
        )}

        {perfil.especialidades.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {perfil.especialidades.map((especialidad) => (
              <span
                key={especialidad}
                className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800"
              >
                {especialidad}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500">
          {perfil.anos_experiencia != null && (
            <span className="flex items-center gap-1">
              <Award className="size-3.5" /> {perfil.anos_experiencia}{" "}
              {perfil.anos_experiencia === 1 ? "año" : "años"} de experiencia
            </span>
          )}
          {perfil.idiomas.length > 0 && (
            <span className="flex items-center gap-1">
              <Languages className="size-3.5" /> {perfil.idiomas.join(", ")}
            </span>
          )}
        </div>

        {perfil.certificaciones.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">{perfil.certificaciones.join(" · ")}</p>
        )}

        {(enlaceWhatsApp || perfil.redes_sociales.length > 0) && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {enlaceWhatsApp && (
              <a
                href={enlaceWhatsApp}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-200 hover:bg-emerald-700"
              >
                Escribirme por WhatsApp
              </a>
            )}
            {perfil.redes_sociales.map((red) => {
              const Icono = ICONO_RED[red.red.toLowerCase()] ?? Globe2;
              return (
                <a
                  key={red.url}
                  href={red.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={red.red}
                  className="flex size-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-violet-700"
                >
                  <Icono className="size-4" />
                </a>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------- Propiedades ---------- */}
      {perfil.propiedades.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
          <h2 className="mb-4 text-center text-sm font-bold uppercase tracking-wide text-slate-400">
            Propiedades
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {perfil.propiedades.map((propiedad) => (
              <a
                key={propiedad.id}
                href={propiedad.eb_public_url ?? undefined}
                target={propiedad.eb_public_url ? "_blank" : undefined}
                rel="noopener noreferrer"
                className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition ${
                  propiedad.eb_public_url ? "hover:shadow-md" : "cursor-default"
                }`}
              >
                {propiedad.imagen && (
                  <img src={propiedad.imagen} alt={propiedad.titulo} className="h-40 w-full object-cover" />
                )}
                <div className="p-4">
                  <p className="line-clamp-2 text-sm font-bold text-slate-900">{propiedad.titulo}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="size-3.5 shrink-0" />
                    <span className="truncate">{propiedad.municipio || propiedad.ubicacion}</span>
                  </p>
                  <p className="mt-2 text-base font-bold text-violet-700">{formatoMXN(propiedad.precio)}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {propiedad.recamaras} rec · {propiedad.banos} baños · {propiedad.m2} m²
                  </p>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-slate-100 py-6 text-center">
        <div className="mx-auto flex w-fit items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          <MarcaHomeID className="size-4" /> HomeID · {perfil.oficina.nombre}
        </div>
      </footer>
    </main>
  );
}

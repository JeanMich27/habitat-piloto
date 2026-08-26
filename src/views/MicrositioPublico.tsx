// Micrositio público del asesor: sin sesión y servido por una Edge Function.
// La respuesta ya está reducida por perfil_publico_por_slug(); esta vista
// aplica una segunda defensa a todas las URLs antes de renderizarlas.
import { useEffect, useState, type ReactNode } from "react";
import {
  Award,
  Building2,
  ExternalLink,
  Globe2,
  Instagram,
  Languages,
  Linkedin,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Quote,
  ServerCrash,
  Sparkles,
} from "lucide-react";
import { MarcaHomeID } from "../components/LogoHomeID";
import { telefonoWhatsApp } from "../lib/whatsapp";
import { urlPublicaSegura } from "../lib/urlPublica";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../lib/supabaseClient";
import { formatoMXN } from "../types";

interface RedSocial { red: string; url: string; }
interface PropiedadPublica {
  id: string;
  titulo: string;
  precio: number;
  ubicacion: string;
  municipio: string;
  recamaras: number;
  banos: number;
  m2: number;
  imagen: string | null;
  eb_public_url: string | null;
}
interface PerfilPublico {
  nombre: string;
  puesto: string;
  foto_url: string | null;
  bio_corta: string | null;
  especialidades: string[];
  anos_experiencia: number | null;
  idiomas: string[];
  certificaciones: string[];
  redes_sociales: RedSocial[];
  telefono: string;
  perfil_completo: boolean;
  oficina: { nombre: string; logo_url: string | null; sitio_web: string | null };
  propiedades: PropiedadPublica[];
}

interface Props { slug: string; }

const ICONO_RED: Record<string, typeof Instagram> = { instagram: Instagram, linkedin: Linkedin };

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).slice(0, 2).map((parte) => parte[0] ?? "").join("").toUpperCase();
}

function TarjetaDato({ icono, titulo, detalle }: { icono: ReactNode; titulo: string; detalle: string }) {
  return (
    <div className="rounded-2xl border border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] p-4 shadow-sm">
      <span className="flex size-9 items-center justify-center rounded-full bg-[var(--micrositio-acento-suave)] text-[var(--micrositio-acento)]">
        {icono}
      </span>
      <p className="mt-3 text-lg font-bold text-[var(--micrositio-texto)]">{titulo}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--micrositio-texto-suave)]">{detalle}</p>
    </div>
  );
}

function TarjetaPropiedad({ propiedad }: { propiedad: PropiedadPublica }) {
  const enlace = urlPublicaSegura(propiedad.eb_public_url ?? "");
  const imagen = urlPublicaSegura(propiedad.imagen ?? "");
  const contenido = (
    <>
      {imagen ? (
        <img src={imagen} alt={propiedad.titulo} loading="lazy" className="h-44 w-full object-cover" />
      ) : (
        <div className="flex h-44 items-center justify-center bg-[var(--micrositio-acento-suave)] text-[var(--micrositio-acento)]">
          <Building2 className="size-8" aria-hidden="true" />
        </div>
      )}
      <div className="p-4">
        <p className="line-clamp-2 text-sm font-bold text-[var(--micrositio-texto)]">{propiedad.titulo}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-[var(--micrositio-texto-suave)]">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{propiedad.municipio || propiedad.ubicacion}</span>
        </p>
        <p className="mt-3 text-base font-bold text-[var(--micrositio-acento)]">{formatoMXN(propiedad.precio)}</p>
        <p className="mt-1 text-xs text-[var(--micrositio-texto-suave)]">
          {propiedad.recamaras} rec · {propiedad.banos} baños · {propiedad.m2} m²
        </p>
      </div>
    </>
  );
  const clase = "block overflow-hidden rounded-2xl border border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md";

  return enlace ? (
    <a href={enlace} target="_blank" rel="noopener noreferrer" className={clase}>{contenido}</a>
  ) : (
    <article className={clase}>{contenido}</article>
  );
}

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
          if (!cancelado) {
            setError(respuesta.status === 404
              ? "No encontramos este micrositio."
              : "El micrositio no está disponible por el momento.");
          }
          return;
        }
        const datos = (await respuesta.json()) as PerfilPublico;
        if (!cancelado) setPerfil(datos);
      } catch {
        if (!cancelado) setError("No pudimos abrir el micrositio. Revisa tu conexión.");
      }
    };
    void cargar();
    return () => { cancelado = true; };
  }, [slug]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
        <div className="max-w-sm text-center">
          <ServerCrash className="mx-auto size-10 text-stone-300" aria-hidden="true" />
          <h1 className="mt-4 text-lg font-bold text-stone-900">{error}</h1>
          <p className="mt-2 text-sm text-stone-500">Verifica el enlace con la persona que te lo compartió.</p>
        </div>
      </main>
    );
  }

  if (!perfil) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50">
        <div role="status" className="flex items-center gap-2 text-sm text-stone-500">
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> Abriendo micrositio…
        </div>
      </main>
    );
  }

  const whatsapp = telefonoWhatsApp(perfil.telefono);
  const enlaceWhatsApp = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola ${perfil.nombre.split(" ")[0]}, vi tu micrositio y me gustaría contactarte.`)}`
    : null;
  const foto = urlPublicaSegura(perfil.foto_url ?? "");
  const logoOficina = urlPublicaSegura(perfil.oficina.logo_url ?? "");
  const sitioOficina = urlPublicaSegura(perfil.oficina.sitio_web ?? "");
  const redesSeguras = perfil.redes_sociales.flatMap((red) => {
    const url = urlPublicaSegura(red.url);
    return url ? [{ ...red, url }] : [];
  });
  const hayExperiencia = perfil.anos_experiencia != null
    || perfil.idiomas.length > 0
    || perfil.certificaciones.length > 0;

  return (
    <main className="micrositio-publico min-h-screen bg-[var(--micrositio-fondo)] text-[var(--micrositio-texto)]">
      <header className="bg-[var(--micrositio-hero)] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {logoOficina ? (
              <img src={logoOficina} alt={`Logo de ${perfil.oficina.nombre}`} className="size-10 rounded-xl bg-white/95 object-contain p-1" />
            ) : (
              <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-sm font-bold">
                {iniciales(perfil.oficina.nombre)}
              </span>
            )}
            <span className="truncate text-sm font-semibold">{perfil.oficina.nombre}</span>
          </div>
          {sitioOficina && (
            <a href={sitioOficina} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white">
              Sitio web <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </div>

        <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-12 pt-6 sm:px-6 md:grid-cols-[auto_1fr] md:items-center md:pb-16 md:pt-10">
          {foto ? (
            <img src={foto} alt={perfil.nombre} className="mx-auto size-36 rounded-full border-4 border-white/20 object-cover shadow-2xl md:size-48" />
          ) : (
            <span className="mx-auto flex size-36 items-center justify-center rounded-full border-4 border-white/20 bg-white/10 text-4xl font-bold shadow-2xl md:size-48">
              {iniciales(perfil.nombre)}
            </span>
          )}
          <div className="text-center md:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--micrositio-dorado)]">Asesoría inmobiliaria</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{perfil.nombre}</h1>
            <p className="mt-2 text-base font-medium text-white/80">{perfil.puesto}</p>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-white/65 md:justify-start">
              <Building2 className="size-4" aria-hidden="true" /> {perfil.oficina.nombre}
            </p>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-white/80 md:mx-0">
              {perfil.bio_corta || "Este asesor está preparando la información de su perfil profesional."}
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 md:justify-start">
              {enlaceWhatsApp && (
                <a href={enlaceWhatsApp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-full bg-[var(--micrositio-dorado)] px-5 py-2.5 text-sm font-bold text-[var(--micrositio-hero)] shadow-lg hover:brightness-105">
                  <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
                </a>
              )}
              {redesSeguras.map((red) => {
                const Icono = ICONO_RED[red.red.toLowerCase()] ?? Globe2;
                return (
                  <a key={`${red.red}-${red.url}`} href={red.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${red.red} de ${perfil.nombre}`} className="flex size-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white">
                    <Icono className="size-4" aria-hidden="true" />
                  </a>
                );
              })}
            </div>
          </div>
        </section>
      </header>

      <div className="mx-auto max-w-6xl space-y-14 px-4 py-12 sm:px-6 sm:py-16">
        <section aria-labelledby="sobre-mi">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--micrositio-acento)]">Perfil profesional</p>
              <h2 id="sobre-mi" className="mt-2 text-2xl font-bold">Sobre mí</h2>
              <p className="mt-4 text-sm leading-7 text-[var(--micrositio-texto-suave)]">
                {perfil.bio_corta || "La información profesional se completará próximamente."}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-bold">Especialidades y zonas de trabajo</h3>
              {perfil.especialidades.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {perfil.especialidades.map((especialidad) => (
                    <span key={especialidad} className="rounded-full border border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] px-3 py-1.5 text-xs font-semibold text-[var(--micrositio-acento)]">
                      {especialidad}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--micrositio-texto-suave)]">Aún no se han indicado especialidades.</p>
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="propiedades">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--micrositio-acento)]">Inventario publicado</p>
          <h2 id="propiedades" className="mt-2 text-2xl font-bold">Mis propiedades</h2>
          {perfil.propiedades.length > 0 ? (
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {perfil.propiedades.map((propiedad) => <TarjetaPropiedad key={propiedad.id} propiedad={propiedad} />)}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] p-8 text-center">
              <Building2 className="mx-auto size-8 text-[var(--micrositio-acento)]" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">Aún no hay propiedades publicadas</p>
              <p className="mt-1 text-xs text-[var(--micrositio-texto-suave)]">Cuando haya inventario disponible aparecerá en esta sección.</p>
            </div>
          )}
        </section>

        <section aria-labelledby="experiencia">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--micrositio-acento)]">Trayectoria</p>
          <h2 id="experiencia" className="mt-2 text-2xl font-bold">Experiencia</h2>
          {hayExperiencia ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {perfil.anos_experiencia != null && (
                <TarjetaDato icono={<Award className="size-4" />} titulo={`${perfil.anos_experiencia} ${perfil.anos_experiencia === 1 ? "año" : "años"}`} detalle="de experiencia inmobiliaria" />
              )}
              {perfil.idiomas.length > 0 && (
                <TarjetaDato icono={<Languages className="size-4" />} titulo={perfil.idiomas.join(", ")} detalle="idiomas de atención" />
              )}
              {perfil.certificaciones.length > 0 && (
                <TarjetaDato icono={<Sparkles className="size-4" />} titulo={perfil.certificaciones.length === 1 ? "1 certificación" : `${perfil.certificaciones.length} certificaciones`} detalle={perfil.certificaciones.join(" · ")} />
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--micrositio-texto-suave)]">La información de experiencia se completará próximamente.</p>
          )}
        </section>

        <section aria-labelledby="opiniones" className="rounded-3xl border border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] p-6 sm:p-8">
          <Quote className="size-8 text-[var(--micrositio-acento)]" aria-hidden="true" />
          <h2 id="opiniones" className="mt-4 text-2xl font-bold">Opiniones</h2>
          <p className="mt-2 text-sm font-semibold">Aún sin opiniones</p>
          <p className="mt-1 text-xs leading-5 text-[var(--micrositio-texto-suave)]">Esta sección mostrará experiencias verificadas cuando el módulo de opiniones esté disponible.</p>
        </section>

        <section aria-labelledby="oficina" className="grid gap-6 rounded-3xl bg-[var(--micrositio-hero)] p-6 text-white sm:p-8 md:grid-cols-[auto_1fr_auto] md:items-center">
          {logoOficina ? (
            <img src={logoOficina} alt={`Logo de ${perfil.oficina.nombre}`} className="size-16 rounded-2xl bg-white object-contain p-2" />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-2xl bg-white/10 text-lg font-bold">{iniciales(perfil.oficina.nombre)}</span>
          )}
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--micrositio-dorado)]">Mi oficina</p>
            <h2 id="oficina" className="mt-2 text-xl font-bold">{perfil.oficina.nombre}</h2>
            <p className="mt-2 text-sm text-white/70">Respaldo profesional para acompañarte durante tu operación inmobiliaria.</p>
          </div>
          {sitioOficina && (
            <a href={sitioOficina} target="_blank" rel="noopener noreferrer" className="flex w-fit items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10">
              Visitar sitio <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          )}
        </section>
      </div>

      <footer className="border-t border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] py-7 text-center">
        <div className="mx-auto flex w-fit items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--micrositio-texto-suave)]">
          <MarcaHomeID className="size-5" /> Tecnología HomeID · {perfil.oficina.nombre}
        </div>
      </footer>
    </main>
  );
}

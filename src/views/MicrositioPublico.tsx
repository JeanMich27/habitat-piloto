// Micrositio público del asesor: sin sesión y servido por una Edge Function.
// La respuesta ya está reducida por perfil_publico_por_slug(); esta vista
// aplica una segunda defensa a todas las URLs antes de renderizarlas.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Award,
  Building2,
  Calculator,
  Download,
  ExternalLink,
  Globe2,
  Home,
  Instagram,
  KeyRound,
  Languages,
  Linkedin,
  LoaderCircle,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Quote,
  ServerCrash,
  Share2,
  Sparkles,
  Tag,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { MarcaHomeID } from "../components/LogoHomeID";
import { compartirEnlace } from "../lib/compartir";
import { descargarVCard } from "../lib/vcard";
import { enlaceWhatsApp, telefonoWhatsApp } from "../lib/whatsapp";
import { urlPublicaSegura } from "../lib/urlPublica";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../lib/supabaseClient";
import { formatoMXN, type TipoInmueble, type TipoOperacion } from "../types";

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
  tipo_operacion: TipoOperacion;
  tipo_inmueble: TipoInmueble;
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

interface Servicio {
  titulo: string;
  detalle: string;
  icono: LucideIcon;
  mensaje: (nombre: string) => string;
}

type FiltroPropiedad = "Todas" | TipoOperacion;

const ICONO_RED: Record<string, typeof Instagram> = { instagram: Instagram, linkedin: Linkedin };
const FILTROS: FiltroPropiedad[] = ["Todas", "Venta", "Renta"];
const SERVICIOS: Servicio[] = [
  { titulo: "Comprar", detalle: "una propiedad", icono: Home, mensaje: (nombre) => `Hola ${nombre}, quiero comprar una propiedad y me gustaría recibir asesoría.` },
  { titulo: "Vender", detalle: "mi propiedad", icono: Tag, mensaje: (nombre) => `Hola ${nombre}, quiero vender una propiedad y me gustaría recibir asesoría.` },
  { titulo: "Rentar", detalle: "una propiedad", icono: KeyRound, mensaje: (nombre) => `Hola ${nombre}, quiero rentar una propiedad y me gustaría recibir asesoría.` },
  { titulo: "Valuar", detalle: "mi propiedad", icono: Calculator, mensaje: (nombre) => `Hola ${nombre}, quiero que valores una propiedad y me gustaría recibir asesoría.` },
  { titulo: "Invertir", detalle: "en bienes raíces", icono: TrendingUp, mensaje: (nombre) => `Hola ${nombre}, quiero invertir en bienes raíces y me gustaría recibir asesoría.` },
];

const NAVEGACION = [
  { etiqueta: "Inicio", destino: "#inicio" },
  { etiqueta: "Propiedades", destino: "#propiedades" },
  { etiqueta: "Servicios", destino: "#servicios" },
  { etiqueta: "Opiniones", destino: "#opiniones" },
  { etiqueta: "Contacto", destino: "#contacto" },
];

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).slice(0, 2).map((parte) => parte[0] ?? "").join("").toUpperCase();
}

function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] || nombre;
}

function etiquetaTipoInmueble(tipo: TipoInmueble): string {
  return tipo === "Depto" ? "Departamento" : tipo;
}

function TarjetaDato({ icono, titulo, detalle }: { icono: ReactNode; titulo: string; detalle: string }) {
  return (
    <div className="rounded-2xl border border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] p-4 shadow-sm">
      <span className="flex size-9 items-center justify-center rounded-full bg-[var(--micrositio-acento-suave)] text-[var(--micrositio-acento)]">{icono}</span>
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
      <div className="relative">
        {imagen ? (
          <img src={imagen} alt={propiedad.titulo} loading="lazy" className="h-48 w-full object-cover" />
        ) : (
          <div className="flex h-48 items-center justify-center bg-[var(--micrositio-acento-suave)] text-[var(--micrositio-acento)]"><Building2 className="size-8" aria-hidden="true" /></div>
        )}
        <span className="absolute bottom-3 left-3 rounded-full bg-[var(--micrositio-superficie)] px-2.5 py-1 text-[10px] font-bold text-[var(--micrositio-acento)] shadow-sm">{propiedad.tipo_operacion}</span>
      </div>
      <div className="p-4">
        <p className="text-xs font-medium text-[var(--micrositio-texto-suave)]">{etiquetaTipoInmueble(propiedad.tipo_inmueble)}</p>
        <p className="mt-1 line-clamp-2 text-sm font-bold text-[var(--micrositio-texto)]">{propiedad.titulo}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-[var(--micrositio-texto-suave)]"><MapPin className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{propiedad.municipio || propiedad.ubicacion}</span></p>
        <p className="mt-3 text-base font-bold text-[var(--micrositio-acento)]">{formatoMXN(propiedad.precio)}{propiedad.tipo_operacion === "Renta" ? " / mes" : ""}</p>
        <p className="mt-1 text-xs text-[var(--micrositio-texto-suave)]">{propiedad.recamaras} rec · {propiedad.banos} baños · {propiedad.m2} m²</p>
      </div>
    </>
  );
  const clase = "block overflow-hidden rounded-2xl border border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md";

  return enlace ? <a href={enlace} target="_blank" rel="noopener noreferrer" className={clase}>{contenido}</a> : <article className={clase}>{contenido}</article>;
}

export default function MicrositioPublico({ slug }: Props) {
  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [filtro, setFiltro] = useState<FiltroPropiedad>("Todas");
  const [avisoCompartir, setAvisoCompartir] = useState<"copiado" | "error" | null>(null);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        setError("Este micrositio no está disponible.");
        return;
      }
      try {
        const respuesta = await fetch(`${SUPABASE_URL}/functions/v1/micrositio-publico?slug=${encodeURIComponent(slug)}`, { headers: { apikey: SUPABASE_ANON_KEY } });
        if (!respuesta.ok) {
          if (!cancelado) setError(respuesta.status === 404 ? "No encontramos este micrositio." : "El micrositio no está disponible por el momento.");
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

  const propiedadesFiltradas = useMemo(() => {
    if (!perfil || filtro === "Todas") return perfil?.propiedades ?? [];
    return perfil.propiedades.filter((propiedad) => propiedad.tipo_operacion === filtro);
  }, [filtro, perfil]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
        <div className="max-w-sm text-center"><ServerCrash className="mx-auto size-10 text-stone-300" aria-hidden="true" /><h1 className="mt-4 text-lg font-bold text-stone-900">{error}</h1><p className="mt-2 text-sm text-stone-500">Verifica el enlace con la persona que te lo compartió.</p></div>
      </main>
    );
  }

  if (!perfil) {
    return <main className="flex min-h-screen items-center justify-center bg-stone-50"><div role="status" className="flex items-center gap-2 text-sm text-stone-500"><LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> Abriendo micrositio…</div></main>;
  }

  const nombre = primerNombre(perfil.nombre);
  const telefono = telefonoWhatsApp(perfil.telefono);
  const mensajeContacto = `Hola ${nombre}, vi tu micrositio y me gustaría contactarte.`;
  const whatsapp = enlaceWhatsApp(perfil.telefono, mensajeContacto);
  const llamar = telefono ? `tel:+${telefono}` : null;
  const navegacion = whatsapp
    ? NAVEGACION
    : NAVEGACION.filter((item) => item.destino !== "#servicios");
  const foto = urlPublicaSegura(perfil.foto_url ?? "");
  const logoOficina = urlPublicaSegura(perfil.oficina.logo_url ?? "");
  const sitioOficina = urlPublicaSegura(perfil.oficina.sitio_web ?? "");
  const redesSeguras = perfil.redes_sociales.flatMap((red) => {
    const url = urlPublicaSegura(red.url);
    return url ? [{ ...red, url }] : [];
  });
  const hayExperiencia = perfil.anos_experiencia != null || perfil.idiomas.length > 0 || perfil.certificaciones.length > 0;

  const compartir = async () => {
    const resultado = await compartirEnlace(window.location.href, perfil.nombre, `Conoce el perfil inmobiliario de ${perfil.nombre}.`);
    if (resultado === "copiado" || resultado === "error") {
      setAvisoCompartir(resultado);
      window.setTimeout(() => setAvisoCompartir(null), 2500);
    }
  };

  const guardarContacto = () => {
    if (!telefono) return;
    descargarVCard({ nombre: perfil.nombre, telefono: `+${telefono}`, oficina: perfil.oficina.nombre, url: window.location.href }, slug || perfil.nombre);
  };

  return (
    <main id="inicio" className="micrositio-publico min-h-screen scroll-smooth bg-[var(--micrositio-fondo)] pb-24 text-[var(--micrositio-texto)] md:pb-0">
      <header className="relative bg-[var(--micrositio-hero)] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <a href="#inicio" className="flex min-w-0 items-center gap-3" aria-label={`Ir al inicio de ${perfil.oficina.nombre}`}>
            {logoOficina ? <img src={logoOficina} alt={`Logo de ${perfil.oficina.nombre}`} className="size-10 rounded-xl bg-white/95 object-contain p-1" /> : <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-sm font-bold">{iniciales(perfil.oficina.nombre)}</span>}
            <span className="truncate text-sm font-semibold">{perfil.oficina.nombre}</span>
          </a>
          <nav aria-label="Navegación principal" className="hidden items-center gap-5 md:flex">
            {navegacion.map((item) => <a key={item.destino} href={item.destino} className="text-xs font-semibold text-white/70 hover:text-white">{item.etiqueta}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void compartir()} className="hidden items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold hover:bg-white/10 md:flex">Compartir <Share2 className="size-3.5" aria-hidden="true" /></button>
            <button type="button" aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuAbierto} aria-controls="menu-micrositio" onClick={() => setMenuAbierto((abierto) => !abierto)} className="flex size-10 items-center justify-center rounded-full border border-white/20 md:hidden">{menuAbierto ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}</button>
          </div>
        </div>
        {menuAbierto && (
          <nav id="menu-micrositio" aria-label="Navegación móvil" className="absolute inset-x-4 top-[4.75rem] z-50 rounded-2xl border border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] p-2 text-[var(--micrositio-texto)] shadow-2xl md:hidden">
            {navegacion.map((item) => <a key={item.destino} href={item.destino} onClick={() => setMenuAbierto(false)} className="block rounded-xl px-4 py-3 text-sm font-semibold hover:bg-[var(--micrositio-acento-suave)]">{item.etiqueta}</a>)}
          </nav>
        )}

        <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-12 pt-6 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)_16rem] lg:items-center lg:pb-16 lg:pt-10">
          {foto ? <img src={foto} alt={perfil.nombre} className="mx-auto size-48 rounded-[2rem] border-4 border-white/15 object-cover shadow-2xl" /> : <span className="mx-auto flex size-48 items-center justify-center rounded-[2rem] border-4 border-white/15 bg-white/10 text-4xl font-bold shadow-2xl">{iniciales(perfil.nombre)}</span>}
          <div className="text-center lg:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--micrositio-dorado)]">Asesoría inmobiliaria</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{perfil.nombre}</h1>
            <p className="mt-2 text-base font-medium text-white/80">{perfil.puesto}</p>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-white/65 lg:justify-start"><Building2 className="size-4" aria-hidden="true" /> {perfil.oficina.nombre}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-full bg-[var(--micrositio-dorado)] px-5 py-2.5 text-sm font-bold text-[var(--micrositio-hero)] shadow-lg hover:brightness-105"><MessageCircle className="size-4" aria-hidden="true" /> WhatsApp</a>}
              {llamar && <a href={llamar} className="flex items-center gap-2 rounded-full border border-white/25 px-4 py-2.5 text-sm font-semibold hover:bg-white/10"><Phone className="size-4" aria-hidden="true" /> Llamar</a>}
              {telefono && <button type="button" onClick={guardarContacto} className="flex items-center gap-2 rounded-full border border-white/25 px-4 py-2.5 text-sm font-semibold hover:bg-white/10"><Download className="size-4" aria-hidden="true" /> Guardar contacto</button>}
            </div>
            {redesSeguras.length > 0 && (
              <div className="mt-5 flex items-center justify-center gap-2 lg:justify-start">
                {redesSeguras.map((red) => { const Icono = ICONO_RED[red.red.toLowerCase()] ?? Globe2; return <a key={`${red.red}-${red.url}`} href={red.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${red.red} de ${perfil.nombre}`} className="flex size-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"><Icono className="size-4" aria-hidden="true" /></a>; })}
              </div>
            )}
          </div>
          <aside className="mx-auto w-full max-w-xs rounded-3xl border border-white/15 bg-white/10 p-5 text-center shadow-xl backdrop-blur-sm">
            <p className="text-sm font-bold">Escanea y contáctame<br />por WhatsApp</p>
            {whatsapp ? <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3"><QRCodeSVG value={whatsapp} size={160} level="M" role="img" aria-label="Código QR de WhatsApp" /></div> : <div className="mt-4 rounded-2xl border border-dashed border-white/20 px-4 py-8 text-xs leading-5 text-white/65">Contacto no disponible por el momento</div>}
            <p className="mt-4 text-xs text-white/65">Te llevará directo a mi chat</p>
          </aside>
        </section>
      </header>

      {avisoCompartir && <div className="fixed right-4 top-4 z-[70] rounded-full bg-[var(--micrositio-hero)] px-4 py-2 text-xs font-semibold text-white shadow-xl" role={avisoCompartir === "error" ? "alert" : "status"}>{avisoCompartir === "copiado" ? "Enlace copiado" : "No se pudo compartir"}</div>}

      <div className="mx-auto max-w-6xl space-y-14 px-4 py-12 sm:px-6 sm:py-16">
        <section id="sobre-mi" aria-labelledby="sobre-mi-titulo" className="scroll-mt-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--micrositio-acento)]">Perfil profesional</p><h2 id="sobre-mi-titulo" className="mt-2 text-2xl font-bold">Sobre mí</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--micrositio-texto-suave)]">{perfil.bio_corta || "La información profesional se completará próximamente."}</p>
        </section>

        <section id="propiedades" aria-labelledby="propiedades-titulo" className="scroll-mt-6 border-t border-[var(--micrositio-borde)] pt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--micrositio-acento)]">Inventario publicado</p><h2 id="propiedades-titulo" className="mt-2 text-2xl font-bold">Mis propiedades</h2></div>
            {perfil.propiedades.length > 0 && <div className="flex gap-2" aria-label="Filtrar propiedades">{FILTROS.map((opcion) => <button key={opcion} type="button" aria-pressed={filtro === opcion} onClick={() => setFiltro(opcion)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${filtro === opcion ? "bg-[var(--micrositio-acento)] text-white" : "border border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] text-[var(--micrositio-texto-suave)]"}`}>{opcion}</button>)}</div>}
          </div>
          {propiedadesFiltradas.length > 0 ? <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{propiedadesFiltradas.map((propiedad) => <TarjetaPropiedad key={propiedad.id} propiedad={propiedad} />)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] p-8 text-center"><Building2 className="mx-auto size-8 text-[var(--micrositio-acento)]" aria-hidden="true" /><p className="mt-3 text-sm font-semibold">{perfil.propiedades.length > 0 ? `No hay propiedades en ${filtro.toLowerCase()}` : "Aún no hay propiedades publicadas"}</p><p className="mt-1 text-xs text-[var(--micrositio-texto-suave)]">{perfil.propiedades.length > 0 ? "Prueba con otro filtro para consultar el inventario." : "Cuando haya inventario disponible aparecerá en esta sección."}</p></div>}
        </section>

        {whatsapp && (
          <section id="servicios" aria-labelledby="servicios-titulo" className="scroll-mt-6 border-t border-[var(--micrositio-borde)] pt-12">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--micrositio-acento)]">Contacto directo</p><h2 id="servicios-titulo" className="mt-2 text-2xl font-bold">¿En qué puedo ayudarte?</h2>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {SERVICIOS.map((servicio) => { const Icono = servicio.icono; const enlace = enlaceWhatsApp(perfil.telefono, servicio.mensaje(nombre)); if (!enlace) return null; return <a key={servicio.titulo} href={enlace} target="_blank" rel="noopener noreferrer" className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] px-3 py-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><span className="flex size-10 items-center justify-center rounded-full bg-[var(--micrositio-acento-suave)] text-[var(--micrositio-acento)]"><Icono className="size-5" aria-hidden="true" /></span><span className="mt-3 text-sm font-bold">{servicio.titulo}</span><span className="mt-0.5 text-[11px] text-[var(--micrositio-texto-suave)]">{servicio.detalle}</span></a>; })}
            </div>
          </section>
        )}

        <section id="opiniones" aria-labelledby="opiniones-titulo" className="scroll-mt-6 rounded-3xl border border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] p-6 sm:p-8"><Quote className="size-8 text-[var(--micrositio-acento)]" aria-hidden="true" /><h2 id="opiniones-titulo" className="mt-4 text-2xl font-bold">Opiniones</h2><p className="mt-2 text-sm font-semibold">Aún sin opiniones</p><p className="mt-1 text-xs leading-5 text-[var(--micrositio-texto-suave)]">Esta sección mostrará experiencias verificadas cuando el módulo de opiniones esté disponible.</p></section>

        <section id="experiencia" aria-label="Trayectoria y oficina" className="scroll-mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {hayExperiencia && <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--micrositio-acento)]">Trayectoria</p><h2 className="mt-2 text-xl font-bold">Experiencia</h2><div className="mt-5 grid gap-3">{perfil.anos_experiencia != null && <TarjetaDato icono={<Award className="size-4" />} titulo={`${perfil.anos_experiencia} ${perfil.anos_experiencia === 1 ? "año" : "años"}`} detalle="de experiencia inmobiliaria" />}{perfil.idiomas.length > 0 && <TarjetaDato icono={<Languages className="size-4" />} titulo={perfil.idiomas.join(", ")} detalle="idiomas de atención" />}{perfil.certificaciones.length > 0 && <TarjetaDato icono={<Sparkles className="size-4" />} titulo={perfil.certificaciones.length === 1 ? "1 certificación" : `${perfil.certificaciones.length} certificaciones`} detalle={perfil.certificaciones.join(" · ")} />}</div></div>}
          {perfil.especialidades.length > 0 && <div className="rounded-3xl border border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] p-6"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--micrositio-acento)]">Cobertura profesional</p><h2 className="mt-2 text-xl font-bold">Zonas y especialidades</h2><div className="mt-5 flex flex-wrap gap-2">{perfil.especialidades.map((especialidad) => <span key={especialidad} className="rounded-full bg-[var(--micrositio-acento-suave)] px-3 py-1.5 text-xs font-semibold text-[var(--micrositio-acento)]">{especialidad}</span>)}</div></div>}
          <div id="oficina" className="scroll-mt-6 rounded-3xl bg-[var(--micrositio-hero)] p-6 text-white"><div className="flex items-center gap-3">{logoOficina ? <img src={logoOficina} alt={`Logo de ${perfil.oficina.nombre}`} className="size-14 rounded-2xl bg-white object-contain p-2" /> : <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-base font-bold">{iniciales(perfil.oficina.nombre)}</span>}<div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--micrositio-dorado)]">Mi oficina</p><h2 className="mt-1 text-lg font-bold">{perfil.oficina.nombre}</h2></div></div><p className="mt-5 text-sm leading-6 text-white/70">Respaldo profesional para acompañarte durante tu operación inmobiliaria.</p>{sitioOficina && <a href={sitioOficina} target="_blank" rel="noopener noreferrer" className="mt-5 flex w-fit items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10">Visitar sitio <ExternalLink className="size-4" aria-hidden="true" /></a>}</div>
        </section>

        <section id="contacto" aria-labelledby="contacto-titulo" className="scroll-mt-6 overflow-hidden rounded-3xl bg-[linear-gradient(120deg,var(--micrositio-hero),var(--micrositio-acento))] px-6 py-10 text-center text-white sm:px-10"><h2 id="contacto-titulo" className="text-2xl font-bold sm:text-3xl">¿Buscas comprar, vender o invertir en una propiedad?</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/75">Estoy aquí para ayudarte a tomar una decisión inmobiliaria con información clara.</p>{whatsapp ? <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="mx-auto mt-6 flex w-fit items-center gap-2 rounded-full bg-[var(--micrositio-superficie)] px-5 py-2.5 text-sm font-bold text-[var(--micrositio-hero)] shadow-lg"><MessageCircle className="size-4" aria-hidden="true" /> Hablar por WhatsApp</a> : <p className="mt-5 text-sm font-semibold text-white/75">Contacto no disponible por el momento.</p>}</section>
      </div>

      <footer className="border-t border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] px-4 pb-28 pt-7 text-center md:py-7"><div className="mx-auto flex w-fit items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--micrositio-texto-suave)]"><MarcaHomeID className="size-5" /> Tecnología HomeID · {perfil.oficina.nombre}</div></footer>

      <nav aria-label="Contacto rápido" className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 md:hidden"><div className="mx-auto flex max-w-md items-stretch rounded-[1.75rem] border border-[var(--micrositio-borde)] bg-[var(--micrositio-superficie)] px-1.5 py-1 shadow-xl">{llamar && <a href={llamar} className="flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-[var(--micrositio-texto-suave)]"><Phone className="size-5" aria-hidden="true" /> Llamar</a>}{whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Contactar por WhatsApp" className="flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-[var(--micrositio-acento)]"><MessageCircle className="size-5" aria-hidden="true" /> WhatsApp</a>}<button type="button" onClick={() => void compartir()} className="flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-[var(--micrositio-texto-suave)]"><Share2 className="size-5" aria-hidden="true" /> Compartir</button></div></nav>
    </main>
  );
}

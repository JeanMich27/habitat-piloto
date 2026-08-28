import { useEffect, useMemo, useState } from "react";
import {
  Bath, BedDouble, Building2, Car, ChevronLeft, ChevronRight, Expand,
  LoaderCircle, MapPin, MessageCircle, Ruler, ServerCrash,
} from "lucide-react";
import { MarcaHomeID } from "../components/LogoHomeID";
import { enlaceWhatsApp } from "../lib/whatsapp";
import { urlPublicaSegura } from "../lib/urlPublica";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../lib/supabaseClient";
import { formatoMXN, type TipoInmueble, type TipoOperacion } from "../types";

interface FichaPublica {
  slug: string;
  titulo: string;
  precio: number;
  tipo_operacion: TipoOperacion;
  tipo_inmueble: TipoInmueble;
  descripcion: string | null;
  municipio: string;
  estado: string;
  colonia: string | null;
  recamaras: number;
  banos: number;
  medios_banos: number | null;
  m2: number;
  m2_terreno: number | null;
  estacionamientos: number | null;
  imagenes: string[];
  amenidades: string[];
  asesor: { nombre: string; puesto: string; foto_url: string | null; telefono: string; slug: string | null };
  oficina: { nombre: string; logo_url: string | null; sitio_web: string | null };
}

export default function PropiedadPublica({ slug }: { slug: string }) {
  const [ficha, setFicha] = useState<FichaPublica | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return setError("Esta propiedad no está disponible.");
      try {
        const respuesta = await fetch(
          `${SUPABASE_URL}/functions/v1/propiedad-publica?slug=${encodeURIComponent(slug)}`,
          { headers: { apikey: SUPABASE_ANON_KEY }, cache: "no-store" },
        );
        if (!respuesta.ok) {
          if (!cancelado) setError(respuesta.status === 404 ? "No encontramos esta propiedad." : "La propiedad no está disponible por el momento.");
          return;
        }
        const datos = await respuesta.json() as FichaPublica;
        if (!cancelado) setFicha(datos);
      } catch {
        if (!cancelado) setError("No pudimos abrir la propiedad. Revisa tu conexión.");
      }
    };
    void cargar();
    return () => { cancelado = true; };
  }, [slug]);

  const imagenes = useMemo(
    () => (ficha?.imagenes ?? []).flatMap((valor) => {
      const segura = urlPublicaSegura(valor);
      return segura ? [segura] : [];
    }),
    [ficha?.imagenes],
  );

  if (error) return <main className="flex min-h-screen items-center justify-center bg-violet-50 px-4"><div className="max-w-sm text-center"><ServerCrash className="mx-auto size-10 text-violet-300" /><h1 className="mt-4 text-lg font-bold text-slate-900">{error}</h1><a href="/" className="mt-4 inline-block text-sm font-semibold text-violet-700">Volver al inicio</a></div></main>;
  if (!ficha) return <main className="flex min-h-screen items-center justify-center bg-violet-50"><div role="status" className="flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="size-5 animate-spin" /> Abriendo propiedad…</div></main>;

  const zona = [ficha.colonia, ficha.municipio, ficha.estado].filter(Boolean).join(", ");
  const foto = urlPublicaSegura(ficha.asesor.foto_url ?? "");
  const logo = urlPublicaSegura(ficha.oficina.logo_url ?? "");
  const whatsapp = enlaceWhatsApp(ficha.asesor.telefono, `Hola ${ficha.asesor.nombre}, vi la propiedad “${ficha.titulo}” y me gustaría recibir más información.`);
  const datos = [
    { etiqueta: "Recámaras", valor: ficha.recamaras, Icono: BedDouble },
    { etiqueta: "Baños", valor: ficha.banos, Icono: Bath },
    { etiqueta: "Construcción", valor: `${ficha.m2} m²`, Icono: Expand },
    ...(ficha.m2_terreno ? [{ etiqueta: "Terreno", valor: `${ficha.m2_terreno} m²`, Icono: Ruler }] : []),
    ...(ficha.estacionamientos ? [{ etiqueta: "Estacionamientos", valor: ficha.estacionamientos, Icono: Car }] : []),
  ];

  return (
    <main className="micrositio-publico min-h-screen bg-[var(--micrositio-fondo)] text-[var(--micrositio-texto)]">
      <header className="border-b border-[var(--micrositio-borde)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a href={ficha.asesor.slug ? `/m/${ficha.asesor.slug}` : "/"} className="flex items-center gap-3">
            {logo ? <img src={logo} alt={`Logo de ${ficha.oficina.nombre}`} className="h-10 w-28 object-contain object-left" /> : <MarcaHomeID className="size-8 text-violet-700" />}
            <span className="hidden text-sm font-bold sm:block">{ficha.oficina.nombre}</span>
          </a>
          {ficha.asesor.slug && <a href={`/m/${ficha.asesor.slug}`} className="flex items-center gap-1 text-xs font-semibold text-violet-700"><ChevronLeft className="size-4" /> Ver perfil del asesor</a>}
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-violet-100 shadow-[var(--micrositio-sombra)]">
          {imagenes.length ? <img src={imagenes[indice]} alt={`${ficha.titulo} — imagen ${indice + 1}`} className="h-[20rem] w-full object-cover sm:h-[30rem]" /> : <div className="flex h-[20rem] items-center justify-center sm:h-[30rem]"><Building2 className="size-14 text-violet-400" /></div>}
          {imagenes.length > 1 && <><button aria-label="Imagen anterior" onClick={() => setIndice((indice - 1 + imagenes.length) % imagenes.length)} className="absolute left-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow"><ChevronLeft /></button><button aria-label="Imagen siguiente" onClick={() => setIndice((indice + 1) % imagenes.length)} className="absolute right-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow"><ChevronRight /></button><span className="absolute bottom-3 right-3 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-semibold text-white">{indice + 1} / {imagenes.length}</span></>}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <article className="rounded-3xl border border-[var(--micrositio-borde)] bg-white p-6 shadow-[var(--micrositio-sombra)] sm:p-8">
            <div className="flex flex-wrap gap-2"><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">{ficha.tipo_operacion}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{ficha.tipo_inmueble === "Depto" ? "Departamento" : ficha.tipo_inmueble}</span></div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{ficha.titulo}</h1>
            <p className="mt-3 flex items-center gap-1.5 text-sm text-[var(--micrositio-texto-suave)]"><MapPin className="size-4 text-violet-600" /> {zona || "Ubicación disponible con el asesor"}</p>
            <p className="mt-5 text-3xl font-bold text-violet-700">{formatoMXN(ficha.precio)}{ficha.tipo_operacion === "Renta" ? " / mes" : ""}</p>
            <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">{datos.map(({ etiqueta, valor, Icono }) => <div key={etiqueta} className="rounded-2xl bg-violet-50 p-4"><Icono className="size-5 text-violet-600" /><dt className="mt-2 text-xs text-slate-500">{etiqueta}</dt><dd className="mt-0.5 text-sm font-bold">{valor}</dd></div>)}</dl>
            {ficha.descripcion && <section className="mt-9"><h2 className="text-xl font-bold">Descripción</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-[var(--micrositio-texto-suave)]">{ficha.descripcion}</p></section>}
            {ficha.amenidades.length > 0 && <section className="mt-9"><h2 className="text-xl font-bold">Amenidades</h2><ul className="mt-4 grid gap-2 sm:grid-cols-2">{ficha.amenidades.map((amenidad) => <li key={amenidad} className="rounded-xl border border-violet-100 px-4 py-3 text-sm">{amenidad}</li>)}</ul></section>}
          </article>

          <aside className="h-fit rounded-3xl border border-violet-100 bg-white p-6 shadow-[var(--micrositio-sombra)] lg:sticky lg:top-6">
            <p className="text-xs font-bold uppercase tracking-widest text-violet-600">Solicita información</p>
            <div className="mt-4 flex items-center gap-3">{foto ? <img src={foto} alt={ficha.asesor.nombre} className="size-14 rounded-full object-cover" /> : <span className="flex size-14 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-700">{ficha.asesor.nombre.split(/\s+/).slice(0,2).map((p) => p[0]).join("")}</span>}<div><p className="font-bold">{ficha.asesor.nombre}</p><p className="text-xs text-slate-500">{ficha.asesor.puesto}</p></div></div>
            {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="mt-6 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-700"><MessageCircle className="size-5" /> Preguntar por esta propiedad</a>}
            <p className="mt-4 text-xs leading-5 text-slate-500">La ubicación mostrada es aproximada. Solicita al asesor los datos de visita.</p>
          </aside>
        </div>
      </div>
      <footer className="mt-10 border-t border-violet-100 bg-white px-4 py-7 text-center text-xs text-slate-500">Ficha publicada con tecnología HomeID</footer>
    </main>
  );
}

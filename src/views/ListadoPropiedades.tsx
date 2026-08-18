import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  MoreVertical,
  Plus,
  Search,
} from "lucide-react";
import StatusBadge, { EnRevisionBadge } from "../components/StatusBadge";
import EstadoPropiedadModal from "../components/EstadoPropiedadModal";
import PropertyCard from "../components/PropertyCard";
import AntiguedadBadge from "../components/AntiguedadBadge";
import {
  ANTIGUEDAD_ESTILOS,
  ANTIGUEDAD_LEYENDA,
  antiguedadDe,
  type NivelAntiguedad,
} from "../lib/antiguedad";
import type {
  Lead,
  PropertyStatus,
  Propiedad,
  SolicitudEstado,
  TipoOperacion,
  Usuario,
} from "../types";
import {
  ESTADOS_PROPIEDAD,
  formatoMXN,
  puedeCargarPropiedades,
  puedeEditarPropiedades,
  solicitaCambioDeEstado,
} from "../types";

type Columna = "direccion" | "precio" | "dias" | "leads" | "visitas" | "estado";

const MS_DIA = 1000 * 60 * 60 * 24;
const diasDesde = (fechaISO: string, ahora: number) =>
  Math.floor((ahora - new Date(fechaISO).getTime()) / MS_DIA);

const ESTADOS: (PropertyStatus | "Todos")[] = ["Todos", ...ESTADOS_PROPIEDAD];
const OPERACIONES: (TipoOperacion | "Todos")[] = ["Todos", "Venta", "Renta"];
const POR_PAGINA_OPCIONES = [25, 50, 100] as const;

interface Props {
  usuario: Usuario;
  usuarios: Usuario[];
  propiedades: Propiedad[];
  leads: Lead[];
  solicitudes: SolicitudEstado[];
  onCambiarEstado: (propiedadId: string, nuevoEstado: PropertyStatus, motivo?: string) => void;
  onSolicitarCambio: (propiedadId: string, nuevoEstado: PropertyStatus, motivo?: string) => void;
  onVerDetalle: (propiedadId: string) => void;
  onNuevaPropiedad: () => void;
  /**
   * Rango de antigüedad precargado. Llega cuando el asesor toca una barra en
   * la gráfica de "Antigüedad de tu inventario" de Salud inmobiliaria: la
   * lista abre mostrando exactamente esas propiedades.
   */
  antiguedadInicial?: NivelAntiguedad | null;
}

export default function ListadoPropiedades({
  usuario,
  usuarios,
  propiedades,
  leads,
  solicitudes,
  onCambiarEstado,
  onSolicitarCambio,
  onVerDetalle,
  onNuevaPropiedad,
  antiguedadInicial,
}: Props) {
  const ahora = useMemo(() => Date.now(), []);
  const alcanceTodos = usuario.rol === "broker";

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<PropertyStatus | "Todos">("Todos");
  const [filtroOperacion, setFiltroOperacion] = useState<TipoOperacion | "Todos">("Todos");
  const [filtroAsesor, setFiltroAsesor] = useState<string>("Todos");
  const [filtroAntiguedad, setFiltroAntiguedad] = useState<NivelAntiguedad | "Todos">(
    antiguedadInicial ?? "Todos",
  );
  const [precioMin, setPrecioMin] = useState("");
  const [precioMax, setPrecioMax] = useState("");
  const [orden, setOrden] = useState<{ col: Columna; dir: "asc" | "desc" }>({
    col: "dias",
    dir: "asc",
  });
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState<(typeof POR_PAGINA_OPCIONES)[number]>(25);
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);
  const [propiedadEstado, setPropiedadEstado] = useState<Propiedad | null>(null);

  // Llegada desde Salud inmobiliaria: se aplica el rango que se tocó y se
  // vuelve a la primera página, para que la lista muestre exactamente las
  // propiedades de esa barra.
  useEffect(() => {
    if (!antiguedadInicial) return;
    setFiltroAntiguedad(antiguedadInicial);
    setPagina(1);
  }, [antiguedadInicial]);

  const nombreAsesor = (id: string) => usuarios.find((u) => u.id === id)?.nombre ?? "Sin asignar";

  const esAsesorEquipo = solicitaCambioDeEstado(usuario.rol);
  const solicitudPendienteDe = (propiedadId: string) =>
    solicitudes.find((s) => s.propiedadId === propiedadId && s.estatus === "pendiente") ?? null;

  const leadsDe = (propiedadId: string) => leads.filter((l) => l.interesPropiedadId === propiedadId);
  const visitasDe = (propiedadId: string) =>
    leadsDe(propiedadId).filter((l) =>
      (["Visitado", "Negociacion", "Cierre"] as const).includes(
        l.etapa as "Visitado" | "Negociacion" | "Cierre",
      ),
    ).length;

  const base = alcanceTodos ? propiedades : propiedades.filter((p) => p.asesorId === usuario.id);

  const filtradas = base.filter((p) => {
    const q = busqueda.trim().toLowerCase();
    const coincideBusqueda =
      q === "" ||
      p.titulo.toLowerCase().includes(q) ||
      p.ubicacion.toLowerCase().includes(q) ||
      p.propietario.nombre.toLowerCase().includes(q);
    const coincideEstado = filtroEstado === "Todos" || p.estatus === filtroEstado;
    const coincideOperacion = filtroOperacion === "Todos" || p.tipoOperacion === filtroOperacion;
    const coincideAsesor =
      !alcanceTodos || filtroAsesor === "Todos" || p.asesorId === filtroAsesor;
    const min = precioMin ? Number(precioMin) : -Infinity;
    const max = precioMax ? Number(precioMax) : Infinity;
    const coincidePrecio = p.precio >= min && p.precio <= max;
    const coincideAntiguedad =
      filtroAntiguedad === "Todos" || antiguedadDe(p, ahora).nivel === filtroAntiguedad;
    return (
      coincideBusqueda &&
      coincideEstado &&
      coincideOperacion &&
      coincideAsesor &&
      coincidePrecio &&
      coincideAntiguedad
    );
  });

  const conteoAntiguedad = (nivel: NivelAntiguedad) =>
    base.filter((p) => antiguedadDe(p, ahora).nivel === nivel).length;

  const valorOrden = (p: Propiedad, col: Columna) => {
    switch (col) {
      case "direccion":
        return p.titulo;
      case "precio":
        return p.precio;
      case "dias":
        return p.publicadaEl ? diasDesde(p.publicadaEl, ahora) : -1;
      case "leads":
        return leadsDe(p.id).length;
      case "visitas":
        return visitasDe(p.id);
      case "estado":
        return p.estatus;
    }
  };

  const ordenadas = [...filtradas].sort((a, b) => {
    const va = valorOrden(a, orden.col);
    const vb = valorOrden(b, orden.col);
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return orden.dir === "asc" ? cmp : -cmp;
  });

  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const paginadas = ordenadas.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  const cambiarOrden = (col: Columna) => {
    setOrden((prev) =>
      prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" },
    );
    setPagina(1);
  };

  const IconoOrden = ({ col }: { col: Columna }) => {
    if (orden.col !== col) return <ArrowUpDown className="size-3 text-slate-300" />;
    return orden.dir === "asc" ? (
      <ArrowUp className="size-3 text-slate-600" />
    ) : (
      <ArrowDown className="size-3 text-slate-600" />
    );
  };

  const th = (label: string, col: Columna) => (
    <th
      className="cursor-pointer select-none px-4 py-3 hover:text-slate-700"
      onClick={() => cambiarOrden(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <IconoOrden col={col} />
      </span>
    </th>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {alcanceTodos ? "Propiedades de la agencia" : "Mis propiedades"}
          </h1>
          <p className="text-sm text-slate-500">
            {ordenadas.length} resultado{ordenadas.length === 1 ? "" : "s"}
          </p>
        </div>
        {/* Captar inventario es del broker; el asesor de equipo no ve el botón. */}
        {puedeCargarPropiedades(usuario.rol) && (
          <button
            onClick={onNuevaPropiedad}
            className="flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-violet-300/60 hover:bg-violet-700"
          >
            <Plus className="size-4" /> Nueva propiedad
          </button>
        )}
      </header>

      {/* Leyenda del termómetro de antigüedad — además de explicar, filtra.
          Es la misma escala que la gráfica de Salud inmobiliaria, así que al
          llegar desde ahí el asesor ve resaltado el rango en el que hizo clic. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-slate-500">
        <span className="font-semibold text-slate-600">Tiempo publicada:</span>
        {ANTIGUEDAD_LEYENDA.map(({ nivel, texto }) => {
          const activo = filtroAntiguedad === nivel;
          return (
            <button
              key={nivel}
              onClick={() => {
                setFiltroAntiguedad(activo ? "Todos" : nivel);
                setPagina(1);
              }}
              aria-pressed={activo}
              aria-label={`Filtrar propiedades con ${texto} publicadas`}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition ${
                activo
                  ? "bg-violet-600 font-bold text-white shadow-sm"
                  : "hover:bg-white/70 hover:text-slate-700"
              }`}
            >
              <span className={`size-2.5 rounded-full ${ANTIGUEDAD_ESTILOS[nivel].punto}`} />
              {texto}
              <span className={activo ? "text-white/80" : "text-slate-400"}>
                ({conteoAntiguedad(nivel)})
              </span>
            </button>
          );
        })}
        {filtroAntiguedad !== "Todos" && (
          <button
            onClick={() => {
              setFiltroAntiguedad("Todos");
              setPagina(1);
            }}
            className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-200"
          >
            Quitar filtro
          </button>
        )}
      </div>

      {/* Buscador y filtros */}
      <div className="glass flex flex-wrap items-center gap-2 p-3">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(1);
            }}
            placeholder="Buscar por dirección o propietario…"
            className="w-full rounded-xl border border-white/70 bg-white/70 py-2 pl-9 pr-3 text-sm focus:border-violet-400 focus:bg-white focus:outline-none"
          />
        </div>

        <select
          value={filtroEstado}
          onChange={(e) => {
            setFiltroEstado(e.target.value as PropertyStatus | "Todos");
            setPagina(1);
          }}
          className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm focus:border-violet-400 focus:bg-white focus:outline-none"
        >
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {e === "Todos" ? "Todos los estados" : e}
            </option>
          ))}
        </select>

        <select
          value={filtroOperacion}
          onChange={(e) => {
            setFiltroOperacion(e.target.value as TipoOperacion | "Todos");
            setPagina(1);
          }}
          className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm focus:border-violet-400 focus:bg-white focus:outline-none"
        >
          {OPERACIONES.map((o) => (
            <option key={o} value={o}>
              {o === "Todos" ? "Venta y renta" : o}
            </option>
          ))}
        </select>

        {alcanceTodos && (
          <select
            value={filtroAsesor}
            onChange={(e) => {
              setFiltroAsesor(e.target.value);
              setPagina(1);
            }}
            className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm focus:border-violet-400 focus:bg-white focus:outline-none"
          >
            <option value="Todos">Todos los asesores</option>
            {usuarios
              .filter((u) => u.rol === "asesor_equipo" || u.rol === "asesor_independiente")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
          </select>
        )}

        <div className="flex items-center gap-1.5">
          <input
            value={precioMin}
            onChange={(e) => {
              setPrecioMin(e.target.value.replace(/\D/g, ""));
              setPagina(1);
            }}
            placeholder="Precio mín."
            inputMode="numeric"
            className="w-28 rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm focus:border-violet-400 focus:bg-white focus:outline-none"
          />
          <span className="text-slate-400">–</span>
          <input
            value={precioMax}
            onChange={(e) => {
              setPrecioMax(e.target.value.replace(/\D/g, ""));
              setPagina(1);
            }}
            placeholder="Precio máx."
            inputMode="numeric"
            className="w-28 rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm focus:border-violet-400 focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Tarjetas (solo móvil): la tabla es incómoda en pantalla chica. */}
      <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:hidden">
        {paginadas.map((p) => (
          <button
            key={p.id}
            onClick={() => onVerDetalle(p.id)}
            className="text-left"
            aria-label={`Abrir ${p.titulo}`}
          >
            <PropertyCard propiedad={p} />
          </button>
        ))}
        {paginadas.length === 0 && (
          <p className="glass col-span-full px-4 py-14 text-center text-sm text-slate-400">
            {base.length === 0
              ? "Aún no tienes propiedades."
              : "Ningún resultado coincide con los filtros."}
          </p>
        )}
      </div>

      {/* Tabla (desktop) */}
      <div className="glass hidden overflow-x-auto md:block">
        <table className="w-full min-w-[64rem] text-left text-sm">
          <thead className="border-b border-slate-200/70 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Foto</th>
              {th("Dirección", "direccion")}
              <th className="px-4 py-3">Colonia / Municipio</th>
              {th("Precio", "precio")}
              {th("Estatus", "estado")}
              {alcanceTodos && <th className="px-4 py-3">Asesor</th>}
              {th("Días en mercado", "dias")}
              {th("Leads", "leads")}
              {th("Visitas", "visitas")}
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginadas.map((p) => {
              return (
                <tr key={p.id} className="hover:bg-white/60">
                  <td className="px-4 py-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 via-slate-600 to-slate-500">
                      <Building2 className="size-4 text-white/70" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{p.titulo}</p>
                    <p className="text-xs text-slate-500">
                      {p.tipoInmueble} · {p.tipoOperacion} · {p.propietario.nombre}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.municipio}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{formatoMXN(p.precio)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge estatus={p.estatus} />
                      {solicitudPendienteDe(p.id) && (
                        <EnRevisionBadge destino={solicitudPendienteDe(p.id)!.estadoSolicitado} />
                      )}
                    </div>
                  </td>
                  {alcanceTodos && (
                    <td className="px-4 py-3 text-slate-600">{nombreAsesor(p.asesorId)}</td>
                  )}
                  <td className="px-4 py-3">
                    <AntiguedadBadge propiedad={p} ahora={ahora} compacta />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{leadsDe(p.id).length}</td>
                  <td className="px-4 py-3 text-slate-600">{visitasDe(p.id)}</td>
                  <td className="relative px-4 py-3 text-right">
                    <button
                      onClick={() => setMenuAbierto(menuAbierto === p.id ? null : p.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <MoreVertical className="size-4" />
                    </button>
                    {menuAbierto === p.id && (
                      <div className="glass-strong absolute right-4 top-10 z-10 w-48 rounded-2xl py-1 text-left">
                        <button
                          onClick={() => {
                            onVerDetalle(p.id);
                            setMenuAbierto(null);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          Ver detalle
                        </button>
                        {/* Editar es del broker y del independiente; el asesor
                            de equipo solo consulta y solicita cambios. */}
                        {puedeEditarPropiedades(usuario.rol) && (
                          <button
                            onClick={() => {
                              onVerDetalle(p.id);
                              setMenuAbierto(null);
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          >
                            Editar
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setPropiedadEstado(p);
                            setMenuAbierto(null);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          {esAsesorEquipo
                            ? solicitudPendienteDe(p.id)
                              ? "Cambio en revisión"
                              : "Solicitar cambio de estado"
                            : "Cambiar estado"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {paginadas.length === 0 && (
              <tr>
                <td colSpan={alcanceTodos ? 10 : 9} className="px-4 py-14 text-center">
                  <p className="text-sm text-slate-400">
                    {base.length === 0
                      ? "Aún no tienes propiedades."
                      : "Ningún resultado coincide con los filtros."}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <span>Mostrar</span>
          <select
            value={porPagina}
            onChange={(e) => {
              setPorPagina(Number(e.target.value) as (typeof POR_PAGINA_OPCIONES)[number]);
              setPagina(1);
            }}
            className="rounded-xl border border-white/70 bg-white/70 px-2 py-1 text-sm focus:border-violet-400 focus:outline-none"
          >
            {POR_PAGINA_OPCIONES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span>por página</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            disabled={paginaSegura <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            className="rounded-full bg-white/70 px-4 py-1.5 font-semibold shadow-sm hover:bg-white disabled:opacity-40"
          >
            Anterior
          </button>
          <span>
            Página {paginaSegura} de {totalPaginas}
          </span>
          <button
            disabled={paginaSegura >= totalPaginas}
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            className="rounded-full bg-white/70 px-4 py-1.5 font-semibold shadow-sm hover:bg-white disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </div>

      {propiedadEstado && (
        <EstadoPropiedadModal
          propiedad={propiedadEstado}
          rolUsuario={usuario.rol}
          solicitudPendiente={solicitudPendienteDe(propiedadEstado.id)}
          onCerrar={() => setPropiedadEstado(null)}
          onGuardar={(nuevoEstado, motivo) => {
            onCambiarEstado(propiedadEstado.id, nuevoEstado, motivo);
            setPropiedadEstado(null);
          }}
          onSolicitar={(nuevoEstado, motivo) => {
            onSolicitarCambio(propiedadEstado.id, nuevoEstado, motivo);
            setPropiedadEstado(null);
          }}
        />
      )}
    </div>
  );
}

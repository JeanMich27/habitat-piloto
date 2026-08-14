import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Circle,
  FileText,
  Home,
  Search,
  User,
  X,
} from "lucide-react";
import type {
  DocumentName,
  Propiedad,
  PropietarioInfo,
  TipoInmueble,
  TipoOperacion,
  Usuario,
} from "../types";

const PASOS = [
  { n: 1, label: "Ubicación y tipo" },
  { n: 2, label: "Propietario" },
  { n: 3, label: "Precio y características" },
  { n: 4, label: "Documentos legales" },
  { n: 5, label: "Fotografías" },
] as const;

const ZONAS = ["Naucalpan", "Atizapán de Zaragoza", "Col. Nápoles", "Ciudad López Mateos", "Otra"];
const TIPOS_INMUEBLE: TipoInmueble[] = ["Casa", "Depto", "Terreno", "Local"];
const DOCS: DocumentName[] = ["INE", "Predial", "Contrato"];

const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const telefonoValido = (v: string) => /^\d{10}$/.test(v.replace(/\D/g, ""));

interface Props {
  usuario: Usuario;
  propiedades: Propiedad[];
  onCancelar: () => void;
  onGuardar: (nueva: Propiedad) => void;
}

export default function NuevaPropiedad({ usuario, propiedades, onCancelar, onGuardar }: Props) {
  const [pasoMax, setPasoMax] = useState(1);
  const [paso, setPaso] = useState(1);
  const [confirmarSalir, setConfirmarSalir] = useState(false);

  // Paso 1
  const [direccion, setDireccion] = useState("");
  const [colonia, setColonia] = useState("");
  const [coloniaOtra, setColoniaOtra] = useState("");
  const [tipoInmueble, setTipoInmueble] = useState<TipoInmueble | "">("");
  const [tipoOperacion, setTipoOperacion] = useState<TipoOperacion | "">("");

  // Paso 2
  const [busquedaPropietario, setBusquedaPropietario] = useState("");
  const [propietarioExistente, setPropietarioExistente] = useState<PropietarioInfo | null>(null);
  const [pNombre, setPNombre] = useState("");
  const [pCorreo, setPCorreo] = useState("");
  const [pTelefono, setPTelefono] = useState("");

  // Paso 3
  const [precio, setPrecio] = useState("");
  const [moneda, setMoneda] = useState<"MXN" | "USD">("MXN");
  const [m2, setM2] = useState("");
  const [recamaras, setRecamaras] = useState("");
  const [banos, setBanos] = useState("");
  const [descripcion, setDescripcion] = useState("");

  // Paso 4
  const [docs, setDocs] = useState<Record<DocumentName, boolean>>({
    INE: false,
    Predial: false,
    Contrato: false,
  });

  // Paso 5
  const [fotos, setFotos] = useState<string[]>([]);
  const [nombreFoto, setNombreFoto] = useState("");

  const propietariosUnicos = Array.from(
    new Map(propiedades.map((p) => [p.propietario.correo, p.propietario])).values(),
  );
  const sugerencias =
    busquedaPropietario.trim().length > 1
      ? propietariosUnicos.filter(
          (pr) =>
            pr.nombre.toLowerCase().includes(busquedaPropietario.toLowerCase()) ||
            pr.correo.toLowerCase().includes(busquedaPropietario.toLowerCase()) ||
            pr.telefono.includes(busquedaPropietario),
        )
      : [];
  const correoDuplicado =
    !propietarioExistente &&
    pCorreo &&
    propietariosUnicos.find((pr) => pr.correo.toLowerCase() === pCorreo.toLowerCase());

  const paso1Valido =
    direccion.trim() !== "" &&
    colonia !== "" &&
    (colonia !== "Otra" || coloniaOtra.trim() !== "") &&
    tipoInmueble !== "" &&
    tipoOperacion !== "";
  const paso2Valido =
    !!propietarioExistente ||
    (pNombre.trim() !== "" && emailValido(pCorreo) && telefonoValido(pTelefono));
  const paso3Valido = Number(precio) > 0;
  const paso4Valido = docs.Contrato; // único obligatorio para avanzar del paso
  const documentosCompletos = docs.INE && docs.Predial && docs.Contrato;

  const hayDatosCapturados = direccion.trim() !== "" || pNombre.trim() !== "" || precio !== "";

  const irPaso = (n: number) => {
    if (n <= pasoMax) setPaso(n);
  };
  const siguiente = () => {
    const max = Math.max(pasoMax, paso + 1);
    setPasoMax(max);
    setPaso((p) => Math.min(5, p + 1));
  };
  const anterior = () => setPaso((p) => Math.max(1, p - 1));

  const construirPropiedad = (estatus: Propiedad["estatus"]): Propiedad => {
    const propietario: PropietarioInfo = propietarioExistente ?? {
      nombre: pNombre,
      correo: pCorreo,
      telefono: pTelefono,
    };
    const ahora = new Date().toISOString();
    const publicandose = estatus === "Publicada";
    return {
      id: `prop-${Date.now()}`,
      titulo: direccion,
      ubicacion: direccion,
      municipio: colonia === "Otra" ? coloniaOtra : colonia,
      estado: "Estado de México",
      precio: Number(precio) || 0,
      recamaras: Number(recamaras) || 0,
      banos: Number(banos) || 0,
      m2: Number(m2) || 0,
      descripcion,
      estatus,
      tipoInmueble: tipoInmueble as TipoInmueble,
      tipoOperacion: tipoOperacion as TipoOperacion,
      asesorId: usuario.id,
      propietario,
      documentos: DOCS.map((nombre) => ({ nombre, aprobado: docs[nombre] })),
      capturadaEl: ahora,
      publicadaEl: publicandose ? ahora : undefined,
      ultimaActividad: ahora,
      eventos: [
        {
          id: `ev-${Date.now()}`,
          fecha: ahora,
          tipo: "Publicacion",
          descripcion:
            estatus === "Publicada"
              ? "Propiedad capturada y publicada directamente por el asesor independiente"
              : "Propiedad capturada, pendiente de validación del Broker/Administrador",
        },
      ],
    };
  };

  const guardarBorrador = () => onGuardar(construirPropiedad("No publicada"));
  const guardarFinal = () => {
    if (usuario.rol === "asesor_independiente") {
      if (!documentosCompletos) return;
      onGuardar(construirPropiedad("Publicada"));
    } else {
      onGuardar(construirPropiedad("No publicada"));
    }
  };

  const intentarCancelar = () => {
    if (hayDatosCapturados) setConfirmarSalir(true);
    else onCancelar();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Nueva propiedad</h1>
          <p className="text-sm text-slate-500">
            {usuario.rol === "asesor_independiente"
              ? "Al terminar, se publica directamente."
              : "Al terminar, se envía a validación del Broker/Administrador."}
          </p>
        </div>
        <button
          onClick={intentarCancelar}
          className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <X className="size-3.5" /> Cancelar
        </button>
      </header>

      {/* Barra de progreso */}
      <div className="flex items-center">
        {PASOS.map((p, i) => (
          <div key={p.n} className="flex flex-1 items-center">
            <button
              onClick={() => irPaso(p.n)}
              disabled={p.n > pasoMax}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className={`flex size-8 items-center justify-center rounded-full text-xs font-bold ${
                  paso === p.n
                    ? "bg-slate-800 text-white"
                    : p.n < paso || p.n < pasoMax
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {p.n < paso ? <Check className="size-4" /> : p.n}
              </span>
              <span
                className={`hidden text-center text-[11px] sm:block ${
                  paso === p.n ? "font-semibold text-slate-800" : "text-slate-400"
                }`}
              >
                {p.label}
              </span>
            </button>
            {i < PASOS.length - 1 && (
              <div className={`mx-1 h-0.5 flex-1 ${p.n < pasoMax ? "bg-emerald-200" : "bg-slate-100"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {/* Paso 1 */}
        {paso === 1 && (
          <div className="space-y-4">
            <Campo label="Dirección completa" obligatorio>
              <input
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Calle, número, colonia…"
                className="input"
              />
            </Campo>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Colonia / Municipio" obligatorio>
                <select value={colonia} onChange={(e) => setColonia(e.target.value)} className="input">
                  <option value="">Selecciona…</option>
                  {ZONAS.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </Campo>
              {colonia === "Otra" && (
                <Campo label="Especifica la colonia" obligatorio>
                  <input
                    value={coloniaOtra}
                    onChange={(e) => setColoniaOtra(e.target.value)}
                    className="input"
                  />
                </Campo>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Tipo de inmueble" obligatorio>
                <select
                  value={tipoInmueble}
                  onChange={(e) => setTipoInmueble(e.target.value as TipoInmueble)}
                  className="input"
                >
                  <option value="">Selecciona…</option>
                  {TIPOS_INMUEBLE.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Tipo de operación" obligatorio>
                <div className="flex gap-2">
                  {(["Venta", "Renta"] as TipoOperacion[]).map((o) => (
                    <button
                      key={o}
                      onClick={() => setTipoOperacion(o)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                        tipoOperacion === o
                          ? "border-slate-800 bg-slate-800 text-white"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </Campo>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <Home className="size-3.5" /> Sin autocompletar de mapas en el MVP (sin integraciones
              externas).
            </p>
          </div>
        )}

        {/* Paso 2 */}
        {paso === 2 && (
          <div className="space-y-4">
            {!propietarioExistente ? (
              <>
                <Campo label="Buscar propietario existente">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={busquedaPropietario}
                      onChange={(e) => setBusquedaPropietario(e.target.value)}
                      placeholder="Nombre, correo o teléfono…"
                      className="w-full rounded-lg border border-slate-300 py-2 pr-3 pl-9 text-sm focus:border-slate-500 focus:outline-none"
                    />
                  </div>
                  {sugerencias.length > 0 && (
                    <div className="mt-1.5 overflow-hidden rounded-lg border border-slate-200">
                      {sugerencias.map((pr) => (
                        <button
                          key={pr.correo}
                          onClick={() => {
                            setPropietarioExistente(pr);
                            setBusquedaPropietario("");
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <User className="size-3.5 text-slate-400" />
                          <span className="font-medium text-slate-700">{pr.nombre}</span>
                          <span className="text-xs text-slate-400">{pr.correo}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </Campo>

                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  o crear nuevo propietario
                </p>

                <Campo label="Nombre" obligatorio>
                  <input value={pNombre} onChange={(e) => setPNombre(e.target.value)} className="input" />
                </Campo>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Campo label="Correo" obligatorio error={pCorreo !== "" && !emailValido(pCorreo) ? "Correo inválido" : undefined}>
                    <input
                      value={pCorreo}
                      onChange={(e) => setPCorreo(e.target.value)}
                      className="input"
                      placeholder="nombre@correo.com"
                    />
                  </Campo>
                  <Campo
                    label="Teléfono"
                    obligatorio
                    error={pTelefono !== "" && !telefonoValido(pTelefono) ? "Deben ser 10 dígitos" : undefined}
                  >
                    <input value={pTelefono} onChange={(e) => setPTelefono(e.target.value)} className="input" />
                  </Campo>
                </div>

                {correoDuplicado && (
                  <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                    <span>Ya existe un propietario con este correo: {correoDuplicado.nombre}.</span>
                    <button
                      onClick={() => setPropietarioExistente(correoDuplicado)}
                      className="font-semibold underline"
                    >
                      Vincular
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-800">{propietarioExistente.nombre}</p>
                  <p className="text-xs text-emerald-600">
                    {propietarioExistente.correo} · {propietarioExistente.telefono}
                  </p>
                </div>
                <button
                  onClick={() => setPropietarioExistente(null)}
                  className="text-xs font-semibold text-emerald-700 underline"
                >
                  Cambiar
                </button>
              </div>
            )}
          </div>
        )}

        {/* Paso 3 */}
        {paso === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Precio" obligatorio>
                <input
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  className="input"
                />
              </Campo>
              <Campo label="Moneda" obligatorio>
                <div className="flex gap-2">
                  {(["MXN", "USD"] as const).map((m) => (
                    <button
                      key={m}
                      disabled={m === "USD"}
                      title={
                        m === "USD"
                          ? "Multi-moneda no está en el MVP: todas las propiedades se publican en pesos (MXN)."
                          : undefined
                      }
                      onClick={() => setMoneda(m)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        moneda === m
                          ? "border-slate-800 bg-slate-800 text-white"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </Campo>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Campo label="m²">
                <input value={m2} onChange={(e) => setM2(e.target.value.replace(/\D/g, ""))} className="input" />
              </Campo>
              <Campo label="Recámaras">
                <input
                  value={recamaras}
                  onChange={(e) => setRecamaras(e.target.value.replace(/\D/g, ""))}
                  className="input"
                />
              </Campo>
              <Campo label="Baños">
                <input value={banos} onChange={(e) => setBanos(e.target.value.replace(/\D/g, ""))} className="input" />
              </Campo>
            </div>
            <Campo label={`Descripción (${descripcion.length} caracteres)`}>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={4}
                className="input"
              />
              {descripcion.length > 0 && descripcion.length < 50 && (
                <p className="mt-1 text-xs text-amber-600">
                  Se recomiendan al menos 50 caracteres para publicar (no bloquea, solo es una sugerencia).
                </p>
              )}
            </Campo>
          </div>
        )}

        {/* Paso 4 */}
        {paso === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Sin backend de archivos en el prototipo — marca cada documento como cargado. El Contrato es
              el único obligatorio para avanzar; los tres se validan definitivamente en la pantalla de
              Validación de Propiedades.
            </p>
            {DOCS.map((d) => (
              <button
                key={d}
                onClick={() => setDocs((prev) => ({ ...prev, [d]: !prev[d] }))}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                  docs[d] ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <FileText className="size-4 text-slate-400" />
                  {d}
                  {d === "Contrato" && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                      obligatorio
                    </span>
                  )}
                </span>
                {docs[d] ? (
                  <CheckCircle2 className="size-5 text-emerald-600" />
                ) : (
                  <Circle className="size-5 text-slate-300" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Paso 5 */}
        {paso === 5 && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                value={nombreFoto}
                onChange={(e) => setNombreFoto(e.target.value)}
                placeholder="nombre-de-la-foto.jpg"
                className="input"
              />
              <button
                onClick={() => {
                  if (!nombreFoto.trim()) return;
                  setFotos((prev) => [...prev, nombreFoto.trim()]);
                  setNombreFoto("");
                }}
                className="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Agregar
              </button>
            </div>
            {fotos.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                Aún no agregas fotografías.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {fotos.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                  >
                    <span className="flex items-center gap-1.5 truncate text-slate-600">
                      <Camera className="size-3.5 shrink-0 text-slate-400" /> {f}
                    </span>
                    <button
                      onClick={() => setFotos((prev) => prev.filter((_, idx) => idx !== i))}
                      className="shrink-0 text-slate-400 hover:text-rose-500"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {fotos.length < 5 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600">
                <AlertTriangle className="size-3.5" /> Se recomiendan al menos 5 fotos para publicar (no
                bloquea, solo es una advertencia).
              </p>
            )}
          </div>
        )}
      </div>

      {/* Navegación */}
      <div className="flex items-center justify-between">
        <button
          onClick={anterior}
          disabled={paso === 1}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40"
        >
          Atrás
        </button>
        <button
          onClick={guardarBorrador}
          disabled={!hayDatosCapturados}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40"
        >
          Guardar como borrador
        </button>
        {paso < 5 ? (
          <button
            onClick={siguiente}
            disabled={
              (paso === 1 && !paso1Valido) ||
              (paso === 2 && !paso2Valido) ||
              (paso === 3 && !paso3Valido) ||
              (paso === 4 && !paso4Valido)
            }
            className="rounded-lg bg-slate-800 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            Siguiente
          </button>
        ) : (
          <button
            onClick={guardarFinal}
            disabled={
              !paso1Valido ||
              !paso2Valido ||
              !paso3Valido ||
              (usuario.rol === "asesor_independiente" && !documentosCompletos)
            }
            title={
              usuario.rol === "asesor_independiente" && !documentosCompletos
                ? "Faltan documentos para publicar directamente"
                : undefined
            }
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {usuario.rol === "asesor_independiente" ? "Guardar y publicar" : "Guardar y enviar a validación"}
          </button>
        )}
      </div>

      {confirmarSalir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">¿Salir sin guardar los cambios?</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Se perderá la información capturada en este formulario.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmarSalir(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Seguir editando
              </button>
              <button
                onClick={onCancelar}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
              >
                Salir sin guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({
  label,
  obligatorio,
  error,
  children,
}: {
  label: string;
  obligatorio?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label} {obligatorio && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
    </div>
  );
}

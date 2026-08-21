import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import type { Lead, Propiedad, Usuario } from "../types";
import {
  CAMPOS_LEAD,
  CAMPOS_PROPIEDAD,
  autoMapear,
  filasALeads,
  filasAPropiedades,
  parseArchivo,
  type FilaImportada,
} from "../lib/importParser";

type TipoImportacion = "propiedades" | "leads";

interface Props {
  usuarios: Usuario[];
  usuarioActivoId: string;
  onImportarPropiedades: (nuevas: Propiedad[]) => void;
  onImportarLeads: (nuevos: Lead[]) => void;
}

export default function ImportarDatos({
  usuarios,
  usuarioActivoId,
  onImportarPropiedades,
  onImportarLeads,
}: Props) {
  const [tipo, setTipo] = useState<TipoImportacion>("propiedades");
  const [asesorId, setAsesorId] = useState(usuarioActivoId);
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filas, setFilas] = useState<FilaImportada[]>([]);
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importado, setImportado] = useState<number | null>(null);

  const campos = tipo === "propiedades" ? CAMPOS_PROPIEDAD : CAMPOS_LEAD;

  const onArchivo = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setImportado(null);
    try {
      const { encabezados: h, filas: f } = await parseArchivo(file);
      if (f.length === 0) {
        setError("El archivo no tiene filas de datos (o no se pudo leer el encabezado).");
        return;
      }
      setEncabezados(h);
      setFilas(f);
      setMapeo(autoMapear(h, campos));
      setNombreArchivo(file.name);
    } catch (e) {
      setError("No se pudo leer el archivo. Verifica que sea un .csv o .xlsx válido.");
    }
  };

  const cambiarTipo = (t: TipoImportacion) => {
    setTipo(t);
    setEncabezados([]);
    setFilas([]);
    setMapeo({});
    setNombreArchivo("");
    setImportado(null);
    setError(null);
  };

  const registrosListos =
    tipo === "propiedades"
      ? filasAPropiedades(filas, mapeo, asesorId)
      : filasALeads(filas, mapeo, asesorId);

  const camposObligatoriosCubiertos = campos
    .filter((c) => c.obligatorio)
    .every((c) => mapeo[c.key]);

  const confirmarImportacion = () => {
    if (tipo === "propiedades") onImportarPropiedades(registrosListos as Propiedad[]);
    else onImportarLeads(registrosListos as Lead[]);
    setImportado(registrosListos.length);
    setFilas([]);
    setEncabezados([]);
    setMapeo({});
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-xl font-bold text-slate-900">Importar datos</h1>
        <p className="text-sm text-slate-500">
          Sube un CSV o Excel con propiedades o leads reales para arrancar el piloto con información
          del negocio en vez de datos de ejemplo.
        </p>
      </header>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {(["propiedades", "leads"] as TipoImportacion[]).map((t) => (
          <button
            key={t}
            onClick={() => cambiarTipo(t)}
            className={`rounded-md px-4 py-1.5 text-xs font-semibold capitalize transition ${
              tipo === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "propiedades" ? "Propiedades" : "Leads"}
          </button>
        ))}
      </div>

      {tipo === "propiedades" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          Todas las propiedades importadas entran como <strong>Intake</strong> (pasan por Validación de
          Propiedades antes de publicarse) — no se salta el control de calidad.
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Asignar registros importados a
          </label>
          <select
            value={asesorId}
            onChange={(e) => setAsesorId(e.target.value)}
            className="input max-w-sm"
          >
            {usuarios
              .filter((u) => u.rol !== "propietario" && u.rol !== "cliente")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
          </select>
        </div>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center hover:bg-slate-50">
          <Upload className="size-6 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">
            {nombreArchivo || "Selecciona un archivo .csv o .xlsx"}
          </span>
          <span className="text-xs text-slate-500">Se detecta el encabezado automáticamente</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => onArchivo(e.target.files?.[0])}
          />
        </label>

        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-sm text-rose-600">
            <AlertTriangle className="size-4" /> {error}
          </p>
        )}

        {importado !== null && (
          <p role="status" className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle2 className="size-4" /> Se importaron {importado} registros.
          </p>
        )}

        {filas.length > 0 && (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mapeo de columnas ({filas.length} filas detectadas en {nombreArchivo})
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {campos.map((campo) => (
                  <div key={campo.key}>
                    <label className="mb-1 block text-xs text-slate-500">
                      {campo.etiqueta} {campo.obligatorio && <span className="text-rose-500">*</span>}
                    </label>
                    <select
                      value={mapeo[campo.key] ?? ""}
                      onChange={(e) =>
                        setMapeo((prev) => ({ ...prev, [campo.key]: e.target.value }))
                      }
                      className="input"
                    >
                      <option value="">— no importar —</option>
                      {encabezados.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {!camposObligatoriosCubiertos && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
                  <AlertTriangle className="size-3.5" /> Asigna una columna a los campos obligatorios (*)
                  para poder importar.
                </p>
              )}
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <FileSpreadsheet className="size-3.5" /> Vista previa ({registrosListos.length} de{" "}
                {filas.length} filas son válidas)
              </p>
              <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      {campos.map((c) => (
                        <th key={c.key} className="px-3 py-2 font-semibold text-slate-500">
                          {c.etiqueta}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {registrosListos.slice(0, 5).map((r: any) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        {campos.map((c) => (
                          <td key={c.key} className="px-3 py-2 text-slate-600">
                            {c.key.startsWith("propietario")
                              ? r.propietario?.[c.key.replace("propietario", "").toLowerCase()] ?? ""
                              : String(r[c.key] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={confirmarImportacion}
                disabled={!camposObligatoriosCubiertos || registrosListos.length === 0}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                Importar {registrosListos.length} registros
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Parseo y mapeo de archivos CSV/Excel para el importador de datos reales
// (Configuración > Importar datos). Enfocado en que 10 personas puedan subir
// su inventario/leads reales sin depender de un formato exacto de columnas:
// detectamos el encabezado más parecido a cada campo por nombre.
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type {
  DocumentName,
  Lead,
  LeadOrigin,
  Propiedad,
  TipoInmueble,
  TipoOperacion,
} from "../types";

export interface FilaImportada {
  [columna: string]: string;
}

export interface ResultadoParseo {
  encabezados: string[];
  filas: FilaImportada[];
}

const normaliza = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

export function parseArchivo(file: File): Promise<ResultadoParseo> {
  const esCSV = /\.csv$/i.test(file.name) || file.type === "text/csv";
  if (esCSV) {
    return new Promise((resolve, reject) => {
      Papa.parse<FilaImportada>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) =>
          resolve({ encabezados: res.meta.fields ?? [], filas: res.data }),
        error: reject,
      });
    });
  }
  return file.arrayBuffer().then((buffer) => {
    const libro = XLSX.read(buffer, { type: "array" });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const filas: FilaImportada[] = XLSX.utils.sheet_to_json(hoja, { defval: "", raw: false });
    const encabezados = filas.length > 0 ? Object.keys(filas[0]) : [];
    return { encabezados, filas };
  });
}

export interface CampoMapeo {
  key: string;
  etiqueta: string;
  obligatorio: boolean;
  alias: string[];
}

export const CAMPOS_PROPIEDAD: CampoMapeo[] = [
  { key: "titulo", etiqueta: "Título / Dirección", obligatorio: true, alias: ["titulo", "direccion", "address", "calle"] },
  { key: "municipio", etiqueta: "Municipio / Colonia", obligatorio: false, alias: ["municipio", "colonia", "zona", "ciudad"] },
  { key: "estado", etiqueta: "Estado", obligatorio: false, alias: ["estado", "edo"] },
  { key: "precio", etiqueta: "Precio", obligatorio: true, alias: ["precio", "price", "monto"] },
  { key: "tipoInmueble", etiqueta: "Tipo de inmueble", obligatorio: false, alias: ["tipo", "tipoinmueble", "tipodeinmueble"] },
  { key: "tipoOperacion", etiqueta: "Operación (Venta/Renta)", obligatorio: false, alias: ["operacion", "tipooperacion"] },
  { key: "recamaras", etiqueta: "Recámaras", obligatorio: false, alias: ["recamaras", "recamara", "habitaciones", "cuartos"] },
  { key: "banos", etiqueta: "Baños", obligatorio: false, alias: ["banos", "baños", "bathrooms"] },
  { key: "m2", etiqueta: "m²", obligatorio: false, alias: ["m2", "metros", "superficie"] },
  { key: "descripcion", etiqueta: "Descripción", obligatorio: false, alias: ["descripcion", "description"] },
  { key: "propietarioNombre", etiqueta: "Propietario — nombre", obligatorio: false, alias: ["propietario", "propietarionombre", "dueno"] },
  { key: "propietarioCorreo", etiqueta: "Propietario — correo", obligatorio: false, alias: ["correo", "propietariocorreo", "email"] },
  { key: "propietarioTelefono", etiqueta: "Propietario — teléfono", obligatorio: false, alias: ["telefono", "propietariotelefono", "tel"] },
];

export const CAMPOS_LEAD: CampoMapeo[] = [
  { key: "nombre", etiqueta: "Nombre del contacto", obligatorio: true, alias: ["nombre", "cliente", "contacto"] },
  { key: "telefono", etiqueta: "Teléfono", obligatorio: false, alias: ["telefono", "tel", "phone"] },
  { key: "origen", etiqueta: "Origen", obligatorio: false, alias: ["origen", "fuente", "source"] },
  { key: "nota", etiqueta: "Nota", obligatorio: false, alias: ["nota", "notas", "comentarios"] },
  { key: "montoOferta", etiqueta: "Monto de oferta", obligatorio: false, alias: ["monto", "oferta", "presupuesto"] },
];

// Para cada campo, encuentra el encabezado del archivo que mejor coincide.
export function autoMapear(encabezados: string[], campos: CampoMapeo[]): Record<string, string> {
  const mapeo: Record<string, string> = {};
  for (const campo of campos) {
    const encontrado = encabezados.find((h) => {
      const hn = normaliza(h);
      return campo.alias.some((a) => hn === normaliza(a)) || hn === normaliza(campo.key);
    });
    if (encontrado) mapeo[campo.key] = encontrado;
  }
  return mapeo;
}

const numerico = (v: string | undefined) => {
  if (!v) return 0;
  const limpio = v.replace(/[^0-9.]/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
};

const TIPOS_VALIDOS: TipoInmueble[] = ["Casa", "Depto", "Terreno", "Local"];
const OPERACIONES_VALIDAS: TipoOperacion[] = ["Venta", "Renta"];
const ORIGENES_VALIDOS: LeadOrigin[] = ["Portal", "Referido", "Redes", "Directo"];
const DOCS: DocumentName[] = ["INE", "Predial", "Contrato"];

// Construye Propiedades listas para insertarse. Todas entran como "Intake"
// (van a Validación) para no saltarse el control de calidad del broker.
export function filasAPropiedades(
  filas: FilaImportada[],
  mapeo: Record<string, string>,
  asesorId: string,
): Propiedad[] {
  const ahora = new Date().toISOString();
  const construidas: (Propiedad | null)[] = filas.map((fila, i) => {
    const val = (key: string) => (mapeo[key] ? (fila[mapeo[key]] ?? "").toString().trim() : "");
    const titulo = val("titulo");
    const precio = numerico(val("precio"));
    if (!titulo || !precio) return null; // fila incompleta: se omite
    const tipoRaw = val("tipoInmueble");
    const opRaw = val("tipoOperacion");
    const nueva: Propiedad = {
      id: `prop-import-${Date.now()}-${i}`,
      titulo,
      ubicacion: titulo,
      municipio: val("municipio") || "Sin especificar",
      estado: val("estado") || "Estado de México",
      precio,
      recamaras: numerico(val("recamaras")),
      banos: numerico(val("banos")),
      m2: numerico(val("m2")),
      descripcion: val("descripcion"),
      estatus: "Intake",
      tipoInmueble: TIPOS_VALIDOS.includes(tipoRaw as TipoInmueble) ? (tipoRaw as TipoInmueble) : "Casa",
      tipoOperacion: OPERACIONES_VALIDAS.includes(opRaw as TipoOperacion) ? (opRaw as TipoOperacion) : "Venta",
      asesorId,
      propietario: {
        nombre: val("propietarioNombre") || "Por confirmar",
        correo: val("propietarioCorreo") || "",
        telefono: val("propietarioTelefono") || "",
      },
      documentos: DOCS.map((nombre) => ({ nombre, aprobado: false })),
      capturadaEl: ahora,
      eventos: [
        {
          id: `ev-import-${Date.now()}-${i}`,
          fecha: ahora,
          tipo: "Nota",
          descripcion: "Propiedad creada por importación masiva (CSV/Excel).",
        },
      ],
    };
    return nueva;
  });
  return construidas.filter((p): p is Propiedad => p !== null);
}

// Construye Leads listos para insertarse; todos entran en etapa "Nuevo".
export function filasALeads(
  filas: FilaImportada[],
  mapeo: Record<string, string>,
  asesorId: string,
): Lead[] {
  const ahora = new Date().toISOString();
  const construidos: (Lead | null)[] = filas.map((fila, i) => {
    const val = (key: string) => (mapeo[key] ? (fila[mapeo[key]] ?? "").toString().trim() : "");
    const nombre = val("nombre");
    if (!nombre) return null;
    const origenRaw = val("origen");
    const monto = val("montoOferta");
    const nuevo: Lead = {
      id: `lead-import-${Date.now()}-${i}`,
      nombre,
      telefono: val("telefono"),
      etapa: "Nuevo",
      origen: ORIGENES_VALIDOS.includes(origenRaw as LeadOrigin) ? (origenRaw as LeadOrigin) : "Directo",
      interesPropiedadId: "",
      asesorId,
      creado: ahora,
      nota: val("nota") || "Importado por CSV/Excel.",
      montoOferta: monto ? numerico(monto) : undefined,
    };
    return nuevo;
  });
  return construidos.filter((l): l is Lead => l !== null);
}

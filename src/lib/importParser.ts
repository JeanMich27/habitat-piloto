// Parseo y mapeo de archivos CSV para el importador de datos reales.
// (Configuración > Importar datos). Enfocado en que 10 personas puedan subir
// su inventario/leads reales sin depender de un formato exacto de columnas:
// detectamos el encabezado más parecido a cada campo por nombre.
import Papa from "papaparse";
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

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5_000;
export const MAX_IMPORT_COLUMNS = 100;

const MIME_CSV_PERMITIDOS = new Set([
  "",
  "text/csv",
  "application/csv",
  "text/plain",
  // Algunos navegadores asignan este MIME a archivos .csv creados por Excel.
  "application/vnd.ms-excel",
]);

export function parseArchivo(file: File): Promise<ResultadoParseo> {
  if (!/\.csv$/i.test(file.name) || !MIME_CSV_PERMITIDOS.has(file.type.toLowerCase())) {
    return Promise.reject(new Error("Formato no permitido. Usa un archivo .csv."));
  }

  if (file.size > MAX_IMPORT_BYTES) {
    return Promise.reject(new Error("El archivo supera el límite de 5 MiB."));
  }

  return new Promise((resolve, reject) => {
    Papa.parse<FilaImportada>(file, {
      header: true,
      skipEmptyLines: true,
      preview: MAX_IMPORT_ROWS + 1,
      complete: (res) => {
        const encabezados = res.meta.fields ?? [];
        if (res.errors.length > 0) {
          reject(new Error("El CSV está corrupto o tiene filas con columnas inconsistentes."));
          return;
        }
        if (encabezados.length === 0) {
          reject(new Error("El CSV no contiene encabezados."));
          return;
        }
        if (encabezados.length > MAX_IMPORT_COLUMNS) {
          reject(new Error(`El CSV supera el límite de ${MAX_IMPORT_COLUMNS} columnas.`));
          return;
        }
        if (res.data.length > MAX_IMPORT_ROWS) {
          reject(new Error(`El CSV supera el límite de ${MAX_IMPORT_ROWS.toLocaleString("es-MX")} filas.`));
          return;
        }
        resolve({ encabezados, filas: res.data });
      },
      error: (error) => reject(new Error(`No se pudo leer el CSV: ${error.message}`)),
    });
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
  // El correo vincula la cuenta del cliente con su lead (Portal Cliente).
  { key: "correo", etiqueta: "Correo", obligatorio: false, alias: ["correo", "email", "mail"] },
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

// Construye Propiedades listas para insertarse. Todas entran como "No publicada"
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
      estatus: "No publicada",
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
          descripcion: "Propiedad creada por importación masiva (CSV).",
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
      correo: val("correo").toLowerCase(),
      etapa: "Nuevo",
      origen: ORIGENES_VALIDOS.includes(origenRaw as LeadOrigin) ? (origenRaw as LeadOrigin) : "Directo",
      interesPropiedadId: "",
      asesorId,
      creado: ahora,
      nota: val("nota") || "Importado por CSV.",
      montoOferta: monto ? numerico(monto) : undefined,
    };
    return nuevo;
  });
  return construidos.filter((l): l is Lead => l !== null);
}

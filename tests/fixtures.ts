// Datos de prueba compartidos. Se construyen a mano (no se leen de db.json)
// para que un cambio en los datos de ejemplo no rompa las pruebas.
import type {
  CalificacionBANT,
  CitaAgenda,
  Lead,
  LeadStage,
  Propiedad,
  Usuario,
} from "../src/types";

const MS_DIA = 1000 * 60 * 60 * 24;
export const haceDias = (d: number) => new Date(Date.now() - d * MS_DIA).toISOString();
export const haceMinutos = (m: number) => new Date(Date.now() - m * 60000).toISOString();

/** BANT que suma 100 pts → Hot. */
export const bantHot: CalificacionBANT = {
  presupuesto: "aprobado",
  autoridad: "decide",
  necesidad: "clara",
  plazo: "inmediato",
  calificadoPor: "u-asesor",
  calificadoEl: haceDias(1),
};

/** BANT que suma 65 pts → Warm. */
export const bantWarm: CalificacionBANT = {
  presupuesto: "tramite",
  autoridad: "decide",
  necesidad: "clara",
  plazo: "largo",
  calificadoPor: "u-asesor",
  calificadoEl: haceDias(1),
};

/** BANT que suma 5 pts → Cold. */
export const bantCold: CalificacionBANT = {
  presupuesto: "sin_definir",
  autoridad: "sin_poder",
  necesidad: "explorando",
  plazo: "largo",
  calificadoPor: "u-asesor",
  calificadoEl: haceDias(1),
};

export const asesor: Usuario = {
  id: "u-asesor",
  nombre: "Ana Rivera",
  correo: "ana@demo.mx",
  telefono: "5550000000",
  rol: "asesor_independiente",
  puesto: "Asesor",
  iniciales: "AR",
  estadoCuenta: "Activo",
};

export function lead(over: Partial<Lead> & { id: string }): Lead {
  return {
    nombre: `Prospecto ${over.id}`,
    telefono: "5551234567",
    etapa: "Nuevo" as LeadStage,
    origen: "Portal",
    interesPropiedadId: "p-1",
    asesorId: "u-asesor",
    creado: haceDias(10),
    nota: "",
    ...over,
  };
}

export function propiedad(over: Partial<Propiedad> & { id: string }): Propiedad {
  return {
    titulo: `Propiedad ${over.id}`,
    ubicacion: "Centro",
    municipio: "Querétaro",
    estado: "Querétaro",
    precio: 4_000_000,
    recamaras: 3,
    banos: 2,
    m2: 180,
    descripcion: "",
    estatus: "Publicada",
    tipoInmueble: "Casa",
    tipoOperacion: "Venta",
    asesorId: "u-asesor",
    propietario: { nombre: "Dueño", telefono: "5550000001", correo: "d@demo.mx" },
    documentos: [],
    capturadaEl: haceDias(40),
    publicadaEl: haceDias(40),
    ...over,
  };
}

const enMinutos = (m: number) => new Date(Date.now() + m * 60000).toISOString();

export function cita(over: Partial<CitaAgenda> & { id: string }): CitaAgenda {
  return {
    asesorId: "u-asesor",
    titulo: "Cita",
    tipo: "visita",
    inicio: enMinutos(120),
    fin: enMinutos(180),
    ubicacion: "",
    notas: "",
    estado: "Agendada",
    ...over,
  };
}

/** Fecha ISO a N minutos de ahora (negativo = en el pasado). */
export const enMinutosISO = enMinutos;

export type ModoParticipante = "pct" | "monto";
export interface Participante { id: string; nombre: string; nota: string; modo: ModoParticipante; valor: number }
export interface Plantilla { etiqueta: string; participantes: Omit<Participante, "id">[] }
export const COLORES = ["#2563eb", "#10b981", "#a855f7", "#f59e0b", "#ef4444", "#0ea5e9", "#ec4899", "#14b8a6"];
export const PLANTILLAS: Plantilla[] = [
  { etiqueta: "30% Captador / 30% Vendedor / 40% Agencia", participantes: [
    { nombre: "Asesor Captador", nota: "Capta la propiedad", modo: "pct", valor: 30 },
    { nombre: "Asesor Vendedor", nota: "Trae al comprador/inquilino", modo: "pct", valor: 30 },
    { nombre: "Agencia Inmobiliaria / Broker", nota: "Oficina, mkt y legal", modo: "pct", valor: 40 },
  ] },
  { etiqueta: "50% Captación / 50% Venta", participantes: [
    { nombre: "Asesor Captador", nota: "Capta la propiedad", modo: "pct", valor: 50 },
    { nombre: "Asesor Vendedor", nota: "Cierra la operación", modo: "pct", valor: 50 },
  ] },
  { etiqueta: "50% Compartida con Agencia Externa", participantes: [
    { nombre: "Nuestra Agencia", nota: "Lado captación", modo: "pct", valor: 50 },
    { nombre: "Agencia Externa", nota: "Lado comprador", modo: "pct", valor: 50 },
  ] },
  { etiqueta: "100% Asesor Único", participantes: [{ nombre: "Asesor", nota: "Captó y cerró la operación", modo: "pct", valor: 100 }] },
];
export const nuevoId = () => `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
export const conId = (items: Omit<Participante, "id">[]): Participante[] => items.map((item) => ({ ...item, id: nuevoId() }));

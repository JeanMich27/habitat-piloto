// La otra mitad de la promesa: que al aterrizar en Clientes o en Propiedades
// la lista muestre EXACTAMENTE lo que decía la barra de la que vino.
//
// Estas pruebas simulan la llegada desde Salud inmobiliaria pasando los
// props de filtro inicial, y verifican qué registros quedan visibles.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Clientes from "../src/views/Clientes";
import ListadoPropiedades from "../src/views/ListadoPropiedades";
import { asesor, bantCold, bantHot, bantWarm, haceDias, haceMinutos, lead, propiedad } from "./fixtures";

vi.mock("../src/components/BotonWhatsApp", () => ({ default: () => null }));
vi.mock("../src/components/CalificarProspectoModal", () => ({ default: () => null }));
vi.mock("../src/components/NuevoClienteModal", () => ({ default: () => null }));
vi.mock("../src/components/PropertyCard", () => ({ default: () => null }));
vi.mock("../src/components/AntiguedadBadge", () => ({ default: () => null }));
vi.mock("../src/components/EstadoPropiedadModal", () => ({ default: () => null }));
vi.mock("../src/components/StatusBadge", () => ({
  default: () => null,
  EnRevisionBadge: () => null,
}));

const leads = [
  lead({
    id: "l1",
    nombre: "Hot Rápido",
    bant: bantHot,
    creado: haceMinutos(120),
    primerContactoEn: haceMinutos(80), // 40 min → primera hora
  }),
  lead({
    id: "l2",
    nombre: "Warm Mismo Día",
    bant: bantWarm,
    creado: haceDias(4),
    primerContactoEn: haceDias(3.8), // ~5 h
  }),
  lead({
    id: "l3",
    nombre: "Cold Tardío",
    bant: bantCold,
    creado: haceDias(9),
    primerContactoEn: haceDias(4), // 5 días
  }),
  lead({ id: "l4", nombre: "Fantasma Uno" }), // sin calificar y sin contactar
  lead({ id: "l5", nombre: "Fantasma Dos" }),
];

const propsClientes = {
  usuario: asesor,
  usuarios: [asesor],
  leads,
  propiedades: [propiedad({ id: "p-1" })],
  onGuardarCalificacion: vi.fn(),
  onRegistrarInteraccion: vi.fn(),
  onCambiarEtapa: vi.fn(),
  onCrearCliente: vi.fn(),
  onAgendarVisita: vi.fn(),
};

/** Nombres visibles en la LISTA (la ficha de detalle repite el nombre). */
function nombresEnLista() {
  return leads.filter((l) => screen.queryAllByText(l.nombre).length > 0).map((l) => l.nombre);
}

describe("Clientes — llegada filtrada por nivel de calificación", () => {
  it("con claseInicial='Hot' solo queda el prospecto Hot", () => {
    render(<Clientes {...propsClientes} claseInicial="Hot" />);
    expect(nombresEnLista()).toEqual(["Hot Rápido"]);
  });

  it("con claseInicial='Sin calificar' quedan los dos sin BANT", () => {
    render(<Clientes {...propsClientes} claseInicial="Sin calificar" />);
    expect(nombresEnLista().sort()).toEqual(["Fantasma Dos", "Fantasma Uno"]);
  });
});

describe("Clientes — llegada filtrada por velocidad de respuesta", () => {
  it("'sin-contactar' deja solo a los que nunca se contactaron", () => {
    render(<Clientes {...propsClientes} respuestaInicial="sin-contactar" />);
    expect(nombresEnLista().sort()).toEqual(["Fantasma Dos", "Fantasma Uno"]);
  });

  it("'primera-hora' deja solo al contactado dentro de la hora", () => {
    render(<Clientes {...propsClientes} respuestaInicial="primera-hora" />);
    expect(nombresEnLista()).toEqual(["Hot Rápido"]);
  });

  it("'mas-de-un-dia' deja solo al tardío", () => {
    render(<Clientes {...propsClientes} respuestaInicial="mas-de-un-dia" />);
    expect(nombresEnLista()).toEqual(["Cold Tardío"]);
  });

  it("muestra un chip que explica el filtro y permite quitarlo", async () => {
    const user = userEvent.setup();
    render(<Clientes {...propsClientes} respuestaInicial="sin-contactar" />);
    const chip = screen.getByRole("button", { name: /Respuesta: Sin contactar aún/i });
    await user.click(chip);
    expect(nombresEnLista()).toHaveLength(leads.length);
  });

  it("sin filtro inicial muestra la cartera completa", () => {
    render(<Clientes {...propsClientes} />);
    expect(nombresEnLista()).toHaveLength(leads.length);
  });
});

const propiedades = [
  propiedad({ id: "p1", titulo: "Casa Nueva", publicadaEl: haceDias(15) }), // verde
  propiedad({ id: "p2", titulo: "Depto Reciente", publicadaEl: haceDias(45) }), // verde
  propiedad({ id: "p3", titulo: "Casa Tibia", publicadaEl: haceDias(100) }), // amarillo
  propiedad({ id: "p4", titulo: "Terreno Viejo", publicadaEl: haceDias(400) }), // rojo
];

const propsPropiedades = {
  usuario: asesor,
  usuarios: [asesor],
  propiedades,
  leads: [],
  solicitudes: [],
  onCambiarEstado: vi.fn(),
  onSolicitarCambio: vi.fn(),
  onVerDetalle: vi.fn(),
  onNuevaPropiedad: vi.fn(),
};

describe("Propiedades — llegada filtrada por antigüedad", () => {
  it("con antiguedadInicial='verde' quedan las dos de 1–2 meses", () => {
    render(<ListadoPropiedades {...propsPropiedades} antiguedadInicial="verde" />);
    expect(screen.getByText(/^2 resultados$/)).toBeInTheDocument();
    expect(screen.queryAllByText("Terreno Viejo")).toHaveLength(0);
  });

  it("con antiguedadInicial='rojo' queda solo el inventario de +6 meses", () => {
    render(<ListadoPropiedades {...propsPropiedades} antiguedadInicial="rojo" />);
    expect(screen.getByText(/^1 resultado$/)).toBeInTheDocument();
    expect(screen.queryAllByText("Casa Nueva")).toHaveLength(0);
  });

  it("sin filtro inicial se ve todo el inventario", () => {
    render(<ListadoPropiedades {...propsPropiedades} />);
    expect(screen.getByText(/^4 resultados$/)).toBeInTheDocument();
  });

  it("la leyenda del termómetro filtra y se puede desactivar tocándola otra vez", async () => {
    const user = userEvent.setup();
    render(<ListadoPropiedades {...propsPropiedades} />);
    const chip = screen.getByRole("button", { name: /Filtrar propiedades con 3–4 meses/i });
    await user.click(chip);
    expect(screen.getByText(/^1 resultado$/)).toBeInTheDocument();
    await user.click(chip);
    expect(screen.getByText(/^4 resultados$/)).toBeInTheDocument();
  });

  it("la leyenda muestra cuántas propiedades hay en cada rango", () => {
    render(<ListadoPropiedades {...propsPropiedades} />);
    const verde = screen.getByRole("button", { name: /Filtrar propiedades con 1–2 meses/i });
    expect(verde.textContent).toContain("(2)");
    const naranja = screen.getByRole("button", { name: /Filtrar propiedades con 5–6 meses/i });
    expect(naranja.textContent).toContain("(0)");
  });
});

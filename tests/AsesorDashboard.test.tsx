// Dashboard del asesor: se protegen los textos que Jean pidió limpiar y la
// tarjeta nueva de Salud inmobiliaria.
//
// Los textos están aquí a propósito: son decisiones de producto, no detalles
// de estilo. Si alguien vuelve a meter "Tarjetas de pipeline", la prueba lo
// caza antes que el usuario.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AsesorDashboard from "../src/views/AsesorDashboard";
import { asesor, bantHot, haceDias, haceMinutos, lead, propiedad } from "./fixtures";

// PropertyCard arrastra imágenes y badges que no aportan a estas pruebas.
vi.mock("../src/components/PropertyCard", () => ({
  default: ({ propiedad: p }: { propiedad: { titulo: string } }) => <div>{p.titulo}</div>,
}));

const leads = [
  lead({
    id: "l1",
    etapa: "Cierre",
    bant: bantHot,
    creado: haceMinutos(120),
    primerContactoEn: haceMinutos(80),
  }),
  lead({ id: "l2", etapa: "Negociacion", creado: haceDias(3), primerContactoEn: haceDias(2.9) }),
  lead({ id: "l3", etapa: "Nuevo" }),
  lead({ id: "l4", etapa: "Nuevo" }),
];

const propiedades = [
  propiedad({ id: "p1", publicadaEl: haceDias(15) }),
  propiedad({ id: "p2", publicadaEl: haceDias(400) }),
];

function montar() {
  const spies = {
    onVerPropiedades: vi.fn(),
    onVerPropiedad: vi.fn(),
    onVerClientes: vi.fn(),
    onVerCliente: vi.fn(),
    onNuevaPropiedad: vi.fn(),
    onVerSalud: vi.fn(),
  };
  render(<AsesorDashboard asesor={asesor} leads={leads} propiedades={propiedades} {...spies} />);
  return { ...spies, user: userEvent.setup() };
}

describe("Dashboard del asesor — textos que Jean pidió limpiar", () => {
  it("el embudo se llama 'Embudo de ventas', sin 'Tarjetas de pipeline'", () => {
    montar();
    expect(screen.getByRole("heading", { name: /^Embudo de ventas$/i })).toBeInTheDocument();
    expect(screen.queryByText(/Tarjetas de pipeline/i)).not.toBeInTheDocument();
  });

  it("el botón del embudo dice 'Abrir embudo', no 'Abrir Pipeline Kanban'", () => {
    montar();
    expect(screen.getByRole("button", { name: /^Abrir embudo$/i })).toBeInTheDocument();
    expect(screen.queryByText(/Pipeline Kanban/i)).not.toBeInTheDocument();
  });

  it("la sección de clientes se llama 'Resumen de clientes e historial', sin 'Tarjeta de'", () => {
    montar();
    expect(
      screen.getByRole("heading", { name: /^Resumen de clientes e historial$/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Tarjeta de resumen/i)).not.toBeInTheDocument();
  });

  it("ya no existe la tarjeta de 'posibles cierres y comisiones'", () => {
    montar();
    expect(screen.queryByText(/posibles cierres y comisiones/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Proyección Financiera de Cierres/i)).not.toBeInTheDocument();
  });
});

describe("Dashboard del asesor — tarjeta de Salud inmobiliaria", () => {
  it("existe y abre la pantalla de Salud", async () => {
    const { user, onVerSalud } = montar();
    await user.click(screen.getByRole("button", { name: /Abrir Salud inmobiliaria/i }));
    expect(onVerSalud).toHaveBeenCalledOnce();
  });

  it("muestra los cuatro signos vitales de la operación", () => {
    montar();
    expect(screen.getByText("Tasa de cierre")).toBeInTheDocument();
    expect(screen.getByText("Primer contacto")).toBeInTheDocument();
    expect(screen.getByText("Clientes Hot")).toBeInTheDocument();
    expect(screen.getByText("Inventario en riesgo")).toBeInTheDocument();
  });

  it("los signos vitales cuadran con los datos del asesor", () => {
    montar();
    // 1 cierre de 4 leads = 25%
    expect(screen.getByText("25%")).toBeInTheDocument();
    // 1 propiedad de 2 tiene más de 4 meses publicada
    expect(screen.getByText(/De 2 con \+4 meses/i)).toBeInTheDocument();
  });
});

describe("Dashboard del asesor — el embudo sigue navegando por etapa", () => {
  it("tocar una tarjeta de etapa abre Clientes con esa etapa", async () => {
    const { user, onVerClientes } = montar();
    await user.click(screen.getByRole("button", { name: /Nuevo Lead/i }));
    expect(onVerClientes).toHaveBeenCalledTimes(1);
    expect(onVerClientes).toHaveBeenCalledWith("Nuevo");
  });

  it("'Abrir embudo' entra sin filtro de etapa", async () => {
    const { user, onVerClientes } = montar();
    await user.click(screen.getByRole("button", { name: /^Abrir embudo$/i }));
    expect(onVerClientes).toHaveBeenCalledTimes(1);
    expect(onVerClientes).toHaveBeenCalledWith();
  });
});

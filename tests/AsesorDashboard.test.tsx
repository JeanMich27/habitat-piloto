// Dashboard del asesor.
//
// Dos cosas se protegen aquí:
//  1. Los textos y secciones que Jean decidió (son producto, no estilo).
//  2. La regla de "cada dato una sola vez" — hay pruebas que fallan si
//     alguien vuelve a meter el total de clientes o los Hot dos veces.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AsesorDashboard from "../src/views/AsesorDashboard";
import {
  asesor,
  bantHot,
  cita,
  enMinutosISO,
  haceDias,
  haceMinutos,
  lead,
  propiedad,
} from "./fixtures";

// PropertyCard arrastra imágenes y badges que no aportan a estas pruebas.
vi.mock("../src/components/PropertyCard", () => ({
  default: ({ propiedad: p }: { propiedad: { titulo: string } }) => <div>{p.titulo}</div>,
}));

const leads = [
  lead({
    id: "l1",
    nombre: "Cliente Cerrado",
    etapa: "Cierre",
    bant: bantHot,
    creado: haceMinutos(120),
    primerContactoEn: haceMinutos(80),
  }),
  lead({
    id: "l2",
    nombre: "Cliente Negociando",
    etapa: "Negociacion",
    creado: haceDias(3),
    primerContactoEn: haceDias(2.9),
  }),
  lead({ id: "l3", nombre: "Cliente Nuevo A", etapa: "Nuevo" }),
  lead({ id: "l4", nombre: "Cliente Nuevo B", etapa: "Nuevo" }),
];

const propiedades = [
  propiedad({ id: "p1", titulo: "Casa Nueva", publicadaEl: haceDias(15) }),
  propiedad({ id: "p2", titulo: "Terreno Viejo", publicadaEl: haceDias(400) }),
];

function montar(over: { citas?: ReturnType<typeof cita>[] } = {}) {
  const spies = {
    onVerPropiedades: vi.fn(),
    onVerPropiedad: vi.fn(),
    onVerClientes: vi.fn(),
    onVerCliente: vi.fn(),
    onNuevaPropiedad: vi.fn(),
    onVerSalud: vi.fn(),
    onVerAgenda: vi.fn(),
  };
  render(
    <AsesorDashboard
      asesor={asesor}
      leads={leads}
      propiedades={propiedades}
      citas={over.citas ?? []}
      {...spies}
    />,
  );
  return { ...spies, user: userEvent.setup() };
}

describe("Dashboard del asesor — textos y secciones acordadas", () => {
  it("el embudo se llama 'Embudo de ventas', sin 'Tarjetas de pipeline'", () => {
    montar();
    expect(screen.getByRole("heading", { name: /Embudo de ventas/i })).toBeInTheDocument();
    expect(screen.queryByText(/Tarjetas de pipeline/i)).not.toBeInTheDocument();
  });

  it("el botón del embudo dice 'Abrir embudo', no 'Abrir Pipeline Kanban'", () => {
    montar();
    expect(screen.getByRole("button", { name: /^Abrir embudo$/i })).toBeInTheDocument();
    expect(screen.queryByText(/Pipeline Kanban/i)).not.toBeInTheDocument();
  });

  it("ya no existe la sección 'Resumen de clientes e historial'", () => {
    montar();
    expect(screen.queryByText(/Resumen de clientes e historial/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Resumen de Cartera y BANT/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Evaluados con BANT/i)).not.toBeInTheDocument();
  });

  it("ya no existe la tarjeta de 'posibles cierres y comisiones'", () => {
    montar();
    expect(screen.queryByText(/posibles cierres y comisiones/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Proyección Financiera de Cierres/i)).not.toBeInTheDocument();
  });

  it("las secciones aparecen en el orden acordado: ahora → salud → embudo → propiedades", () => {
    montar();
    const texto = document.body.textContent ?? "";
    const pos = (s: string) => texto.indexOf(s);
    expect(pos("Salud inmobiliaria")).toBeGreaterThan(pos("Hola,"));
    expect(pos("Embudo de ventas")).toBeGreaterThan(pos("Salud inmobiliaria"));
    expect(pos("Mis propiedades")).toBeGreaterThan(pos("Embudo de ventas"));
  });
});

describe("Dashboard del asesor — cada dato aparece una sola vez", () => {
  it("el total de clientes no se repite: solo vive en el denominador de la tasa", () => {
    montar();
    // Antes salía en el saludo, en 'Total leads/clientes' y aquí.
    expect(screen.getAllByText(/1 de 4 clientes/)).toHaveLength(1);
    expect(screen.queryByText(/Total leads/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Registrados en cartera/i)).not.toBeInTheDocument();
  });

  it("los clientes Hot aparecen una sola vez", () => {
    montar();
    expect(screen.getAllByText("Clientes Hot")).toHaveLength(1);
    expect(screen.queryByText(/Prioridad alta/i)).not.toBeInTheDocument();
  });

  it("el saludo ya no repite los contadores de propiedades y clientes", () => {
    montar();
    expect(screen.queryByText(/2 propiedades · 4 clientes/)).not.toBeInTheDocument();
  });

  it("no hay botones sueltos que dupliquen el menú inferior", () => {
    montar();
    expect(screen.queryByRole("button", { name: /^Ver mis clientes$/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Ir a la Sección de Clientes/i }),
    ).not.toBeInTheDocument();
  });

  it("Salud tiene un solo control: la franja, sin botón repetido en el encabezado", () => {
    montar();
    expect(screen.getAllByRole("button", { name: /Abrir Salud inmobiliaria/i })).toHaveLength(1);
  });
});

describe("Dashboard del asesor — franja 'tu día de hoy'", () => {
  it("sin citas próximas lo dice y ofrece abrir la agenda", async () => {
    const { user, onVerAgenda } = montar();
    expect(screen.getByText(/No tienes citas próximas agendadas/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Abrir agenda/i }));
    expect(onVerAgenda).toHaveBeenCalledTimes(1);
  });

  it("muestra la próxima cita con hora, cliente y propiedad", () => {
    montar({
      citas: [
        cita({
          id: "c1",
          inicio: enMinutosISO(90),
          fin: enMinutosISO(150),
          leadId: "l2",
          propiedadId: "p1",
        }),
      ],
    });
    const franja = screen.getByRole("button", { name: /Abrir agenda: ver tu próxima cita/i });
    expect(franja.textContent).toMatch(/Visita a propiedad/);
    expect(franja.textContent).toMatch(/Cliente Negociando/);
    expect(franja.textContent).toMatch(/Casa Nueva/);
  });

  it("toma la más próxima, no la primera de la lista", () => {
    montar({
      citas: [
        cita({ id: "lejana", inicio: enMinutosISO(600), fin: enMinutosISO(660), leadId: "l1" }),
        cita({ id: "cercana", inicio: enMinutosISO(30), fin: enMinutosISO(90), leadId: "l2" }),
      ],
    });
    expect(screen.getByText(/Cliente Negociando/)).toBeInTheDocument();
    expect(screen.queryByText(/Cliente Cerrado/)).not.toBeInTheDocument();
  });

  it("ignora citas canceladas, ya realizadas y de otros asesores", () => {
    montar({
      citas: [
        cita({ id: "cancelada", inicio: enMinutosISO(10), estado: "Cancelada", leadId: "l1" }),
        cita({ id: "realizada", inicio: enMinutosISO(20), estado: "Realizada", leadId: "l1" }),
        cita({ id: "ajena", inicio: enMinutosISO(30), asesorId: "u-otro", leadId: "l1" }),
        cita({ id: "buena", inicio: enMinutosISO(120), leadId: "l2" }),
      ],
    });
    expect(screen.getByText(/Cliente Negociando/)).toBeInTheDocument();
    expect(screen.queryByText(/Cliente Cerrado/)).not.toBeInTheDocument();
  });

  it("con una sola cita no muestra el conteo del día: sería ruido", () => {
    montar({ citas: [cita({ id: "unica", inicio: enMinutosISO(45), fin: enMinutosISO(105) })] });
    expect(screen.queryByText(/citas hoy/i)).not.toBeInTheDocument();
  });
});

describe("Dashboard del asesor — navegación", () => {
  it("la franja de Salud abre el análisis", async () => {
    const { user, onVerSalud } = montar();
    await user.click(screen.getByRole("button", { name: /Abrir Salud inmobiliaria/i }));
    expect(onVerSalud).toHaveBeenCalledTimes(1);
  });

  it("tocar una tarjeta de etapa abre Clientes con esa etapa", async () => {
    const { user, onVerClientes } = montar();
    await user.click(screen.getByRole("button", { name: /2 clientes en etapa Nuevo/i }));
    expect(onVerClientes).toHaveBeenCalledTimes(1);
    expect(onVerClientes).toHaveBeenCalledWith("Nuevo");
  });

  it("'Abrir embudo' entra sin filtro de etapa", async () => {
    const { user, onVerClientes } = montar();
    await user.click(screen.getByRole("button", { name: /^Abrir embudo$/i }));
    expect(onVerClientes).toHaveBeenCalledTimes(1);
    expect(onVerClientes).toHaveBeenCalledWith();
  });

  it("los signos vitales cuadran con los datos del asesor", () => {
    montar();
    expect(screen.getByText("25%")).toBeInTheDocument(); // 1 cierre de 4
    expect(screen.getByText(/De 2 con \+4 meses/i)).toBeInTheDocument();
  });
});

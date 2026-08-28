// Dashboard del broker: misma regla de "cada dato una sola vez".
//
// Lo que se protege: que no vuelvan las dos tarjetas que repetían el pipeline
// ni el segundo acceso a Alertas, y que el pipeline sí lleve a los registros.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BrokerDashboard from "../src/views/BrokerDashboard";
import { asesor, cita, haceDias, haceMinutos, lead, propiedad } from "./fixtures";
import type { Usuario } from "../src/types";

const broker: Usuario = {
  id: "u-broker",
  nombre: "Jean Pérez",
  correo: "jean@demo.mx",
  telefono: "5550000009",
  rol: "broker",
  puesto: "Broker",
  iniciales: "JP",
  estadoCuenta: "Activo",
};

const leads = [
  lead({ id: "l1", etapa: "Cierre", estado: "Ganado", creado: haceDias(2), cerradoEn: haceDias(1), primerContactoEn: haceMinutos(30), montoOferta: 5_000_000 }),
  lead({ id: "l2", etapa: "Negociacion", creado: haceDias(3), primerContactoEn: haceDias(2.9), montoOferta: 3_000_000 }),
  lead({ id: "l3", etapa: "Nuevo", creado: haceDias(4) }),
  lead({ id: "l4", etapa: "Nuevo", creado: haceDias(5) }),
];

const propiedades = [propiedad({ id: "p1", publicadaEl: haceDias(15) })];

function montar() {
  const spies = {
    onVerAsesor: vi.fn(),
    onVerPropiedad: vi.fn(),
    onVerCliente: vi.fn(),
    onVerClientes: vi.fn(),
  };
  render(
    <BrokerDashboard
      broker={broker}
      usuarios={[broker, asesor]}
      propiedades={propiedades}
      leads={leads}
      citas={[cita({ id: "c1", leadId: "l2", propiedadId: "p1" })]}
      {...spies}
    />,
  );
  return { ...spies, user: userEvent.setup() };
}

describe("Dashboard del broker — sin datos duplicados", () => {
  it("no repite el total de leads como tarjeta: eso lo dice el pipeline", () => {
    montar();
    expect(screen.queryByText(/Leads del periodo/i)).not.toBeInTheDocument();
  });

  it("distingue las operaciones ganadas de la etapa Cierre", () => {
    montar();
    expect(screen.getByText(/^Operaciones ganadas$/i)).toBeInTheDocument();
  });

  it("Alertas tiene un solo acceso, el botón guía del panel", () => {
    montar();
    const accesos = screen.getAllByRole("button", { name: /pendientes que requieren tu atención/i });
    expect(accesos).toHaveLength(1);
    // La tarjeta suelta que decía "Alertas / N activas" ya no existe.
    expect(screen.queryByText(/^Alertas$/)).not.toBeInTheDocument();
  });

  it("conserva las cifras que el pipeline no puede mostrar", () => {
    montar();
    expect(screen.getByText(/Conversión de la cohorte/i)).toBeInTheDocument();
    expect(screen.getByText(/Respuesta mediana/i)).toBeInTheDocument();
    expect(screen.getByText(/Ingreso confirmado/i)).toBeInTheDocument();
    expect(screen.getByText(/Propiedades publicadas/i)).toBeInTheDocument();
    expect(screen.getByText(/Citas próximas/i)).toBeInTheDocument();
  });
});

describe("Dashboard del broker — el pipeline navega", () => {
  it("tocar una etapa abre Clientes filtrado en ella", async () => {
    const { user, onVerClientes } = montar();
    await user.click(screen.getByRole("button", { name: /2 leads en etapa Nuevo/i }));
    expect(onVerClientes).toHaveBeenCalledTimes(1);
    expect(onVerClientes).toHaveBeenCalledWith("Nuevo");
  });

  it("una etapa vacía no navega a una lista vacía", async () => {
    const { user, onVerClientes } = montar();
    await user.click(screen.getByRole("button", { name: /0 leads en etapa Visitado/i }));
    expect(onVerClientes).not.toHaveBeenCalled();
  });

  it("el total de leads se muestra como acotación del pipeline, no como tarjeta", () => {
    montar();
    expect(screen.getByText(/4 leads · toca una etapa/i)).toBeInTheDocument();
  });
});

describe("Dashboard del broker — inventario y demanda", () => {
  it("muestra estados, exclusiva, documentación y señales verificables", () => {
    montar();
    expect(screen.getByRole("button", { name: /1 Publicada/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1 sin exclusiva/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1 con documentos pendientes/i })).toBeInTheDocument();
    expect(screen.getByText(/Demanda por propiedad/i)).toBeInTheDocument();
    expect(screen.getByText(/no registra analítica web/i)).toBeInTheDocument();
  });

  it("abre una propiedad desde la demanda", async () => {
    const { user, onVerPropiedad } = montar();
    await user.click(screen.getByRole("button", { name: /Abrir Propiedad p1/i }));
    expect(onVerPropiedad).toHaveBeenCalledWith("p1");
  });
});

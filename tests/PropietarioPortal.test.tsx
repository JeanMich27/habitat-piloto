import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PropietarioPortal from "../src/views/PropietarioPortal";
import { asesor, propiedad } from "./fixtures";

describe("portal propietario con agregados seguros", () => {
  it("muestra las métricas reales de la RPC aunque RLS no entregue leads", () => {
    const p = propiedad({ id: "prop-owner" });
    render(
      <PropietarioPortal
        propiedadesPropietario={[p]}
        usuarios={[asesor]}
        leads={[]}
        metricas={{ [p.id]: { leads: 12, visitas: 4, ofertas: 2, actividad: 3 } }}
      />,
    );
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("diferencia fallo backend de una propiedad sin actividad", () => {
    const p = propiedad({ id: "prop-error", publicadaEl: undefined });
    render(
      <PropietarioPortal
        propiedadesPropietario={[p]}
        usuarios={[asesor]}
        leads={[]}
        metricas={{}}
        errorMetricas="No se pudieron cargar las métricas reales."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("No se mostrarán ceros");
    expect(screen.queryByText("Leads recibidos")).not.toBeInTheDocument();
  });
});

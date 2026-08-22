import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ClientePortal from "../src/views/ClientePortal";
import type { CitaAgenda, Lead } from "../src/types";
import { lead, propiedad } from "./fixtures";

const leadConCita = (): Lead =>
  lead({
    id: "lead-cliente",
    cierre: {
      etapaActual: 1,
      documentos: [],
      citas: [],
    },
  });

const citaCliente = (): CitaAgenda => ({
  id: "cita-1",
  asesorId: "u-asesor",
  leadId: "lead-cliente",
  propiedadId: "p-1",
  titulo: "Firma",
  tipo: "firma",
  inicio: new Date(Date.now() + 86_400_000).toISOString(),
  fin: new Date(Date.now() + 90_000_000).toISOString(),
  ubicacion: "Oficina",
  notas: "",
  estado: "Agendada",
});

describe("ClientePortal: confirmación respaldada por backend", () => {
  it("muestra el error y no afirma éxito cuando la RPC falla", async () => {
    const confirmar = vi.fn().mockResolvedValue("No se pudo confirmar la cita. Intenta de nuevo.");
    render(
      <ClientePortal
        lead={leadConCita()}
        propiedad={propiedad({ id: "p-1" })}
        citas={[citaCliente()]}
        onConfirmarCita={confirmar}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Citas" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar asistencia" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo confirmar");
    expect(screen.getByRole("button", { name: "Confirmar asistencia" })).toBeEnabled();
  });

  it("muestra confirmación solo después de que el backend responde bien", async () => {
    const confirmar = vi.fn().mockResolvedValue(null);

    function Caso() {
      const [citas, setCitas] = useState([citaCliente()]);
      return (
        <ClientePortal
          lead={leadConCita()}
          propiedad={propiedad({ id: "p-1" })}
          citas={citas}
          onConfirmarCita={async (leadId, citaId) => {
            const error = await confirmar(leadId, citaId);
            if (!error) {
              setCitas((prev) =>
                prev.map((c) => c.id === citaId ? { ...c, estado: "Confirmada" as const } : c),
              );
            }
            return error;
          }}
        />
      );
    }

    render(<Caso />);
    await userEvent.click(screen.getByRole("button", { name: "Citas" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar asistencia" }));

    expect(await screen.findByRole("button", { name: "Confirmada ✓" })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

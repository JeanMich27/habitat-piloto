import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ClientePortal from "../src/views/ClientePortal";
import type { Lead } from "../src/types";
import { lead, propiedad } from "./fixtures";

const leadConCita = (): Lead =>
  lead({
    id: "lead-cliente",
    cierre: {
      etapaActual: 1,
      documentos: [],
      citas: [
        {
          id: "cita-1",
          fecha: new Date(Date.now() + 86_400_000).toISOString(),
          ubicacion: "Oficina",
          tipo: "Firma",
          estado: "Programada",
        },
      ],
    },
  });

describe("ClientePortal: confirmación respaldada por backend", () => {
  it("muestra el error y no afirma éxito cuando la RPC falla", async () => {
    const confirmar = vi.fn().mockResolvedValue("No se pudo confirmar la cita. Intenta de nuevo.");
    render(
      <ClientePortal
        lead={leadConCita()}
        propiedad={propiedad({ id: "p-1" })}
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
      const [actual, setActual] = useState(leadConCita());
      return (
        <ClientePortal
          lead={actual}
          propiedad={propiedad({ id: "p-1" })}
          onConfirmarCita={async (leadId, citaId) => {
            const error = await confirmar(leadId, citaId);
            if (!error) {
              setActual((prev) => ({
                ...prev,
                cierre: prev.cierre && {
                  ...prev.cierre,
                  citas: prev.cierre.citas.map((c) =>
                    c.id === citaId ? { ...c, estado: "Confirmada" as const } : c,
                  ),
                },
              }));
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

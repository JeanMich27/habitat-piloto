import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Clientes from "../src/views/Clientes";
import { asesor, lead } from "./fixtures";
import type { Usuario } from "../src/types";

vi.mock("../src/components/BotonWhatsApp", () => ({ default: () => null }));
vi.mock("../src/components/CalificarProspectoModal", () => ({ default: () => null }));
vi.mock("../src/components/NuevoClienteModal", () => ({ default: () => null }));

const broker: Usuario = {
  id: "u-broker", nombre: "Broker Principal", correo: "broker@test.mx", telefono: "",
  rol: "broker", puesto: "Broker", iniciales: "BP", estadoCuenta: "Activo",
};
const destino: Usuario = {
  ...asesor, id: "u-destino", nombre: "Asesor Destino", correo: "destino@test.mx",
};

describe("Clientes — reasignación del broker", () => {
  it("muestra información interna neutra y exige un motivo", async () => {
    const user = userEvent.setup();
    const onReasignarCliente = vi.fn().mockResolvedValue(true);
    render(<Clientes
      usuario={broker}
      usuarios={[broker, asesor, destino]}
      leads={[lead({ id: "l-1", nombre: "Cliente Uno", captadoPorId: asesor.id })]}
      propiedades={[]}
      onGuardarCalificacion={vi.fn()}
      onRegistrarInteraccion={vi.fn()}
      onCambiarEtapa={vi.fn()}
      onCrearCliente={vi.fn()}
      onAgendarVisita={vi.fn()}
      onReasignarCliente={onReasignarCliente}
      onCargarHistorialAsignaciones={vi.fn().mockResolvedValue([])}
    />);

    await user.click(screen.getByRole("button", { name: "Reasignar responsable" }));
    expect(screen.getByText(/Los datos de asignación son internos de la plataforma/)).toBeInTheDocument();
    expect(screen.queryByText(/EasyBroker/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Motivo del cambio"), "Redistribución de carga");
    await user.click(screen.getByRole("button", { name: "Confirmar reasignación" }));
    expect(onReasignarCliente).toHaveBeenCalledWith(expect.objectContaining({
      leadId: "l-1", nuevoAsesorId: destino.id, motivo: "Redistribución de carga",
    }));
  });
});

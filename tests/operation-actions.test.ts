import { describe, expect, it } from "vitest";
import { createOperationActions } from "../src/app/application/operationActions";
import type { ConfirmPersistence } from "../src/app/application/persistence";
import type { Lead, Operacion, Propiedad, Usuario } from "../src/types";
import { lead, propiedad } from "./fixtures";

const broker: Usuario = {
  id: "broker-op", nombre: "Broker", correo: "broker@test.mx", telefono: "",
  rol: "broker", puesto: "Broker", iniciales: "BR", estadoCuenta: "Activo",
};

describe("flujo local de operaciones", () => {
  it("reporta sin cifras y solo cierra lead y propiedad cuando el broker valida", async () => {
    let operaciones: Operacion[] = [];
    let leads: Lead[] = [lead({ id: "lead-op", etapa: "Cierre", estado: "Activo", interesPropiedadId: "prop-op" })];
    let propiedades: Propiedad[] = [propiedad({ id: "prop-op", estatus: "Publicada" })];
    const setOperaciones = (next: Operacion[] | ((current: Operacion[]) => Operacion[])) => {
      operaciones = typeof next === "function" ? next(operaciones) : next;
    };
    const setLeads = (next: Lead[] | ((current: Lead[]) => Lead[])) => {
      leads = typeof next === "function" ? next(leads) : next;
    };
    const setPropiedades = (next: Propiedad[] | ((current: Propiedad[]) => Propiedad[])) => {
      propiedades = typeof next === "function" ? next(propiedades) : next;
    };
    const confirmPersistence: ConfirmPersistence = async (_operation, apply) => {
      apply();
      return true;
    };
    const crear = () => createOperationActions({
      operaciones, setOperaciones, setLeads, setPropiedades,
      currentUser: broker, cloudEnabled: false, confirmPersistence,
    });

    await expect(crear().reportarOperacion({ leadId: "lead-op", propiedadId: "prop-op" })).resolves.toBe(true);
    expect(operaciones[0]).toMatchObject({ estadoValidacion: "reportada", montoFinal: undefined });
    expect(leads[0].estado).toBe("Activo");
    expect(propiedades[0].estatus).toBe("Publicada");

    await expect(crear().resolverOperacion({
      operacionId: operaciones[0].id,
      resultado: "validada",
      tipoOperacion: "Venta",
      propiedadId: "prop-op",
    })).resolves.toBe(true);
    expect(operaciones[0]).toMatchObject({ estadoValidacion: "validada", comisionBrutaConfirmada: undefined });
    expect(leads[0]).toMatchObject({ estado: "Ganado", etapa: "Cierre" });
    expect(propiedades[0].estatus).toBe("Vendida o Rentada");
  });
});

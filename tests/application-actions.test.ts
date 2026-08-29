import { describe, expect, it, vi } from "vitest";
import { createLeadActions } from "../src/app/application/leadActions";
import { asesor, bantHot, lead } from "./fixtures";
import type { Lead } from "../src/types";

const setup = (items: Lead[]) => {
  let state = items;
  const setLeads = vi.fn((next: Lead[] | ((current: Lead[]) => Lead[])) => {
    state = typeof next === "function" ? next(state) : next;
  });
  const persist = vi.fn(async (_operation: () => Promise<unknown>, apply: () => void) => {
    apply();
    return true;
  });
  const notice = vi.fn();
  return {
    actions: createLeadActions({ leads: state, setLeads, currentUser: asesor, confirmPersistence: persist, setBusinessNotice: notice }),
    persist, notice, getState: () => state,
  };
};

describe("casos de uso de leads", () => {
  it("bloquea una etapa avanzada sin BANT antes de persistir", async () => {
    const context = setup([lead({ id: "l-1" })]);
    await expect(context.actions.moverLead("l-1", "Cierre")).resolves.toBe(false);
    expect(context.persist).not.toHaveBeenCalled();
    expect(context.notice).toHaveBeenCalledOnce();
  });

  it("persiste el avance y agrega un evento cuando BANT está completo", async () => {
    const context = setup([lead({ id: "l-1", bant: bantHot })]);
    await expect(context.actions.moverLead("l-1", "Cierre")).resolves.toBe(true);
    expect(context.getState()[0]).toMatchObject({ etapa: "Cierre" });
    expect(context.getState()[0].historial?.at(-1)?.tipo).toBe("Etapa");
  });

  it("no expone un atajo para marcar Ganado sin validación del broker", () => {
    const context = setup([lead({ id: "l-1", etapa: "Cierre", estado: "Activo" })]);
    expect(context.actions).not.toHaveProperty("marcarLeadGanado");
    expect(context.getState()[0].estado).toBe("Activo");
  });
});

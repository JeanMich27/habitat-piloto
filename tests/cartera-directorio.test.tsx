/**
 * Lo que NO estaba probado y por eso se rompió en silencio.
 *
 * El 13 de agosto la migración multi-tenant volvió obligatoria `agencia_id` y
 * la ingesta dejó de guardar leads durante 7 días sin que ninguna prueba se
 * quejara: la suite cubría tableros, no la frontera entre los datos que entran
 * por sincronización y los que se ven en pantalla.
 *
 * Estas pruebas defienden esa frontera: el directorio importado de EasyBroker
 * y el histórico existen en la misma tabla que el embudo, pero NUNCA deben
 * contaminar los conteos operativos.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Clientes from "../src/views/Clientes";
import { esLeadOperativo } from "../src/types";
import { asesor, lead, propiedad } from "./fixtures";

const activo = lead({ id: "l-activo", nombre: "Prospecto Activo" });
const directorio = lead({
  id: "ebc-1", nombre: "Contacto Directorio", esDirectorio: true, etapa: "Contactado",
});
const historico = lead({
  id: "eb-9", nombre: "Lead Historico", esHistorico: true, etapa: "Contactado",
});

describe("esLeadOperativo", () => {
  it("cuenta solo el embudo real", () => {
    expect(esLeadOperativo(activo)).toBe(true);
    expect(esLeadOperativo(directorio)).toBe(false);
    expect(esLeadOperativo(historico)).toBe(false);
  });

  it("un lead sin banderas es operativo (los datos viejos no se caen)", () => {
    const viejo = lead({ id: "sin-banderas" });
    delete (viejo as Record<string, unknown>).esDirectorio;
    delete (viejo as Record<string, unknown>).esHistorico;
    expect(esLeadOperativo(viejo)).toBe(true);
  });

  it("filtrar 1 activo entre mucho directorio deja 1", () => {
    const muchos = [
      activo,
      ...Array.from({ length: 500 }, (_, i) =>
        lead({ id: `ebc-${i + 100}`, nombre: `D${i}`, esDirectorio: true }),
      ),
    ];
    expect(muchos.filter(esLeadOperativo)).toHaveLength(1);
  });
});

describe("Clientes: selector de cartera", () => {
  const pintar = () =>
    render(
      <Clientes
        usuario={asesor}
        usuarios={[asesor]}
        leads={[activo, directorio, historico]}
        propiedades={[propiedad({ id: "p-1" })]}
        onGuardarCalificacion={() => {}}
        onRegistrarInteraccion={() => {}}
        onCambiarEtapa={() => {}}
        onCrearCliente={() => {}}
        onAgendarVisita={() => {}}
        clienteInicialId={null}
        etapaInicial={null}
        claseInicial={null}
        respuestaInicial={null}
      />,
    );

  it("abre en Embudo activo y esconde directorio e histórico", () => {
    pintar();
    expect(screen.getAllByText("Prospecto Activo").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Contacto Directorio")).toHaveLength(0);
    expect(screen.queryAllByText("Lead Historico")).toHaveLength(0);
  });

  it("Directorio muestra solo lo importado del CRM", async () => {
    pintar();
    await userEvent.click(screen.getByRole("button", { name: /Directorio/i }));
    expect(screen.getAllByText("Contacto Directorio").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Prospecto Activo")).toHaveLength(0);
  });

  it("Todos muestra la cartera completa", async () => {
    pintar();
    // El primer "Todos" pertenece al selector de cartera; el segundo filtra
    // el estado del lead y no cambia el universo directorio/histórico.
    await userEvent.click(screen.getAllByRole("button", { name: /^Todos/i })[0]);
    expect(screen.getAllByText("Prospecto Activo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Contacto Directorio").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Lead Historico").length).toBeGreaterThan(0);
  });
});

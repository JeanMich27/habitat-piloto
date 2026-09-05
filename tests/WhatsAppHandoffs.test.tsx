import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import WhatsAppHandoffs from "../src/views/WhatsAppHandoffs";
import type { Usuario } from "../src/types";
import { lead } from "./fixtures";

const repository = vi.hoisted(() => ({
  listarConversacionesWhatsApp: vi.fn(),
  listarCanalesWhatsApp: vi.fn(),
  listarMensajesWhatsApp: vi.fn(),
  enviarMensajeWhatsApp: vi.fn(),
  asignarCanalWhatsApp: vi.fn(),
  clasificarConversacionWhatsApp: vi.fn(),
}));

vi.mock("../src/repositories/whatsappRepository", () => repository);

const broker: Usuario = {
  id: "broker", nombre: "Broker", correo: "broker@test.mx", telefono: "5550000000",
  rol: "broker", puesto: "Broker", iniciales: "BR", estadoCuenta: "Activo",
};
const advisor: Usuario = {
  id: "advisor", nombre: "Ana Asesora", correo: "ana@test.mx", telefono: "5550000001",
  rol: "asesor_equipo", puesto: "Asesora", iniciales: "AA", estadoCuenta: "Activo",
};
const client = lead({ id: "lead-wa", nombre: "Cliente WhatsApp", telefono: "5512345678", asesorId: advisor.id });
const conversation = {
  id: 10, agencia_id: "default", canal_id: "channel-1", telefono_norm: "5512345678",
  telefono_whatsapp: "5215512345678", contacto_nombre: "Cliente WhatsApp", lead_id: client.id,
  visibilidad: "laboral" as const, estado: "humano" as const, asignado_a: advisor.id,
  solicitado_humano_en: null, asignado_en: null, handoff_reason: null, cerrada_por: null,
  cerrada_en: null, resumen_cierre: null, ventana_expira_en: new Date(Date.now() + 60_000).toISOString(),
  creado: new Date().toISOString(), actualizado: new Date().toISOString(), ultimoMensaje: null,
};
const channel = {
  id: "channel-1", agencia_id: "default", usuario_id: advisor.id, phone_number_id: "meta-phone-1",
  waba_id: null, telefono_mostrado: "+52 55 0000 0001", modo: "coexistence" as const,
  protege_personal: true, activo: true, creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(),
};
const message = {
  id: 1, agencia_id: "default", conversacion_id: conversation.id, direccion: "entrante" as const,
  wa_message_id: "wamid.1", cuerpo: "Quiero visitar una propiedad", autor: "usuario",
  enviado_por: null, estado_entrega: null, client_request_id: null, recibido_en: new Date().toISOString(),
  intent: "schedule_visit", confidence: 0.95, reason_code: "schedule_visit",
};

const props = {
  usuarios: [broker, advisor], leads: [client], propiedades: [], tareas: [],
  onGuardarCalificacion: vi.fn(), onRegistrarInteraccion: vi.fn(), onAgendarVisita: vi.fn(),
  onRegistrarIntento: vi.fn().mockResolvedValue(true), onCompletarProximaTarea: vi.fn().mockResolvedValue(true),
  onProgramarSeguimiento: vi.fn(), onAbrirCliente: vi.fn(),
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function prepare() {
  repository.listarConversacionesWhatsApp.mockResolvedValue([conversation]);
  repository.listarCanalesWhatsApp.mockResolvedValue([channel]);
  repository.listarMensajesWhatsApp.mockResolvedValue([message]);
  repository.enviarMensajeWhatsApp.mockResolvedValue(undefined);
}

describe("Bandeja laboral de WhatsApp", () => {
  it("deja al broker en supervisión de solo lectura", async () => {
    prepare();
    render(<WhatsAppHandoffs usuario={broker} {...props} />);
    expect((await screen.findAllByText("Cliente WhatsApp")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Supervisión de solo lectura/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Mensaje" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Calificar cliente/i })).not.toBeInTheDocument();
  });

  it("permite al asesor responder desde su canal", async () => {
    prepare();
    const user = userEvent.setup();
    render(<WhatsAppHandoffs usuario={advisor} {...props} />);
    const textbox = await screen.findByRole("textbox", { name: "Mensaje" });
    await user.type(textbox, "Te confirmo los horarios disponibles");
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));
    await waitFor(() => expect(repository.enviarMensajeWhatsApp).toHaveBeenCalledWith(
      conversation.id, "Te confirmo los horarios disponibles",
    ));
    expect(props.onRegistrarInteraccion).toHaveBeenCalledWith(client.id, "WhatsApp", "Mensaje enviado desde HomeID");
    expect(screen.getByRole("button", { name: /Calificar cliente/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agendar cita/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Programar seguimiento/i })).toBeInTheDocument();
  });

  it("mantiene un remitente desconocido privado hasta que el asesor lo clasifica", async () => {
    const pending = {
      ...conversation,
      id: 11,
      lead_id: null,
      contacto_nombre: "Contacto por identificar",
      visibilidad: "pendiente" as const,
      estado: "requiere_revision" as const,
    };
    repository.listarConversacionesWhatsApp.mockResolvedValue([pending]);
    repository.listarCanalesWhatsApp.mockResolvedValue([channel]);
    repository.listarMensajesWhatsApp.mockResolvedValue([{ ...message, conversacion_id: pending.id }]);
    repository.clasificarConversacionWhatsApp.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<WhatsAppHandoffs usuario={advisor} {...props} />);
    expect(await screen.findByText("¿Es una conversación de trabajo?")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Mensaje" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Es personal" }));
    await waitFor(() => expect(repository.clasificarConversacionWhatsApp).toHaveBeenCalledWith(
      pending.id, "personal", undefined,
    ));
  });
});

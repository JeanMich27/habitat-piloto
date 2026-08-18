// Pantalla de Salud inmobiliaria: lo que se prueba es la promesa que le
// hicimos al asesor — "toca cualquier dato y te llevo al detalle exacto".
//
// Cada prueba hace clic en un elemento de una gráfica y verifica que se llamó
// al callback de navegación correcto CON el filtro correcto. Si alguien
// reordena las barras o cambia un handler, esto truena.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SaludInmobiliaria from "../src/views/SaludInmobiliaria";
import { asesor, bantCold, bantHot, bantWarm, haceDias, haceMinutos, lead, propiedad } from "./fixtures";

// La proyección detallada tiene su propia lógica y sus propias pruebas; aquí
// estorba (formularios, tarifas) y hace lento el render.
vi.mock("../src/components/ProyeccionComisiones", () => ({
  default: () => <div data-testid="proyeccion-comisiones" />,
}));

const leads = [
  // Hot, contactado en la primera hora, en Cierre
  lead({
    id: "l1",
    etapa: "Cierre",
    bant: bantHot,
    creado: haceMinutos(120),
    primerContactoEn: haceMinutos(80),
    montoOferta: 5_000_000,
  }),
  // Warm, contactado el mismo día, en Negociación
  lead({
    id: "l2",
    etapa: "Negociacion",
    bant: bantWarm,
    creado: haceDias(4),
    primerContactoEn: haceDias(3.8),
  }),
  // Cold, contactado tarde, Contactado
  lead({ id: "l3", etapa: "Contactado", bant: bantCold, creado: haceDias(9), primerContactoEn: haceDias(4) }),
  // Sin calificar y sin contactar, Nuevo
  lead({ id: "l4", etapa: "Nuevo" }),
  lead({ id: "l5", etapa: "Nuevo" }),
  // De OTRO asesor: no debe contar en ninguna gráfica.
  lead({ id: "ajeno", etapa: "Cierre", asesorId: "u-otro", bant: bantHot }),
];

const propiedades = [
  propiedad({ id: "p1", publicadaEl: haceDias(15) }), // verde
  propiedad({ id: "p2", publicadaEl: haceDias(45) }), // verde (2 meses)
  propiedad({ id: "p3", publicadaEl: haceDias(100) }), // amarillo
  propiedad({ id: "p4", publicadaEl: haceDias(400) }), // rojo
  propiedad({ id: "ajena", publicadaEl: haceDias(15), asesorId: "u-otro" }),
];

function montar() {
  const spies = {
    onVolver: vi.fn(),
    onVerClientesPorEtapa: vi.fn(),
    onVerClientesPorRespuesta: vi.fn(),
    onVerClientesPorNivel: vi.fn(),
    onVerPropiedadesPorAntiguedad: vi.fn(),
  };
  render(<SaludInmobiliaria asesor={asesor} leads={leads} propiedades={propiedades} {...spies} />);
  return { ...spies, user: userEvent.setup() };
}

describe("Salud inmobiliaria — encabezado y signos vitales", () => {
  it("se llama Salud inmobiliaria y ya no 'Posibles cierres y comisiones'", () => {
    montar();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Salud inmobiliaria");
    expect(screen.queryByText(/Posibles cierres y comisiones/i)).not.toBeInTheDocument();
  });

  it("el título de la cartera ya no dice '(calificación BANT)'", () => {
    montar();
    expect(screen.getByText("Salud de tu cartera")).toBeInTheDocument();
    expect(screen.queryByText(/calificación BANT/i)).not.toBeInTheDocument();
  });

  it("muestra 'Cómo estás operando' antes que 'Tu dinero en juego'", () => {
    const { container } = render(
      <SaludInmobiliaria
        asesor={asesor}
        leads={leads}
        propiedades={propiedades}
        onVolver={vi.fn()}
        onVerClientesPorEtapa={vi.fn()}
        onVerClientesPorRespuesta={vi.fn()}
        onVerClientesPorNivel={vi.fn()}
        onVerPropiedadesPorAntiguedad={vi.fn()}
      />,
    );
    const texto = container.textContent ?? "";
    expect(texto.indexOf("Cómo estás operando")).toBeGreaterThan(-1);
    expect(texto.indexOf("Cómo estás operando")).toBeLessThan(texto.indexOf("Tu dinero en juego"));
  });

  it("solo cuenta la cartera del asesor, nunca la de otros", () => {
    montar();
    // 5 leads propios: el del asesor "u-otro" no entra en ningún conteo.
    expect(screen.getByText("1 de 5 clientes")).toBeInTheDocument();
  });

  it("mantiene la proyección financiera al final de la pantalla", () => {
    montar();
    expect(screen.getByText(/Comisión esperada \(ponderada\)/i)).toBeInTheDocument();
    expect(screen.getByTestId("proyeccion-comisiones")).toBeInTheDocument();
  });
});

describe("Salud inmobiliaria — el embudo navega a Clientes por etapa", () => {
  it("tocar 'Negociación' abre Clientes filtrado en esa etapa", async () => {
    const { user, onVerClientesPorEtapa } = montar();
    await user.click(screen.getByLabelText(/clientes en etapa Negociación/i));
    expect(onVerClientesPorEtapa).toHaveBeenCalledTimes(1);
    expect(onVerClientesPorEtapa).toHaveBeenCalledWith("Negociacion");
  });

  it("tocar 'Nuevo' manda la etapa Nuevo, no la primera de la lista", async () => {
    const { user, onVerClientesPorEtapa } = montar();
    await user.click(screen.getByLabelText(/2 clientes en etapa Nuevo/i));
    expect(onVerClientesPorEtapa).toHaveBeenCalledTimes(1);
    expect(onVerClientesPorEtapa).toHaveBeenCalledWith("Nuevo");
  });

  it("una etapa vacía no navega a una lista vacía", async () => {
    const { user, onVerClientesPorEtapa } = montar();
    await user.click(screen.getByLabelText(/0 clientes en etapa Visitado/i));
    expect(onVerClientesPorEtapa).not.toHaveBeenCalled();
  });
});

describe("Salud inmobiliaria — velocidad de respuesta navega por rango", () => {
  it("tocar 'Sin contactar aún' abre Clientes con ese rango", async () => {
    const { user, onVerClientesPorRespuesta } = montar();
    await user.click(screen.getByLabelText(/Sin contactar aún/i));
    expect(onVerClientesPorRespuesta).toHaveBeenCalledTimes(1);
    expect(onVerClientesPorRespuesta).toHaveBeenCalledWith("sin-contactar");
  });

  it("tocar 'En la primera hora' manda ese rango y no otro", async () => {
    const { user, onVerClientesPorRespuesta } = montar();
    await user.click(screen.getByLabelText(/En la primera hora/i));
    expect(onVerClientesPorRespuesta).toHaveBeenCalledTimes(1);
    expect(onVerClientesPorRespuesta).toHaveBeenCalledWith("primera-hora");
  });

  it("es de solo lectura: no expone ningún campo editable", () => {
    montar();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

describe("Salud inmobiliaria — la cartera usa iconos y navega por nivel", () => {
  it("cada nivel es un botón con su icono, no solo texto", () => {
    montar();
    const hot = screen.getByLabelText(/1 clientes Hot/i);
    expect(hot.querySelector("svg")).toBeTruthy();
  });

  it("tocar Hot abre Clientes filtrado en Hot", async () => {
    const { user, onVerClientesPorNivel } = montar();
    await user.click(screen.getByLabelText(/clientes Hot/i));
    expect(onVerClientesPorNivel).toHaveBeenCalledTimes(1);
    expect(onVerClientesPorNivel).toHaveBeenCalledWith("Hot");
  });

  it("tocar 'Sin calificar' manda el nivel 'sin'", async () => {
    const { user, onVerClientesPorNivel } = montar();
    await user.click(screen.getByLabelText(/2 clientes Sin calificar/i));
    expect(onVerClientesPorNivel).toHaveBeenCalledTimes(1);
    expect(onVerClientesPorNivel).toHaveBeenCalledWith("sin");
  });

  it("el donut refleja los mismos conteos que la leyenda", () => {
    montar();
    const donut = screen.getByRole("img", { name: /Cartera por calificación/i });
    // Cada segmento lleva su propio <title>: es el tooltip nativo del SVG.
    const tooltips = [...donut.querySelectorAll("title")].map((t) => t.textContent ?? "");
    expect(tooltips).toHaveLength(4); // Hot, Warm, Cold y Sin calificar tienen datos
    expect(tooltips.some((t) => /^Hot .*: 1 /.test(t))).toBe(true);
    expect(tooltips.some((t) => /^Warm .*: 1 /.test(t))).toBe(true);
    expect(tooltips.some((t) => /^Cold .*: 1 /.test(t))).toBe(true);
    expect(tooltips.some((t) => /^Sin calificar .*: 2 /.test(t))).toBe(true);
    // El número del centro es el total de la cartera propia.
    expect(donut.textContent).toContain("5");
  });
});

describe("Salud inmobiliaria — antigüedad navega a Propiedades por rango", () => {
  it("tocar '1–2 meses' abre las propiedades verdes de ese rango", async () => {
    const { user, onVerPropiedadesPorAntiguedad } = montar();
    await user.click(screen.getByLabelText(/2 propiedades con 1–2 meses/i));
    expect(onVerPropiedadesPorAntiguedad).toHaveBeenCalledTimes(1);
    expect(onVerPropiedadesPorAntiguedad).toHaveBeenCalledWith("verde");
  });

  it("tocar '+6 meses' abre el inventario rojo", async () => {
    const { user, onVerPropiedadesPorAntiguedad } = montar();
    await user.click(screen.getByLabelText(/1 propiedades con \+6 meses/i));
    expect(onVerPropiedadesPorAntiguedad).toHaveBeenCalledTimes(1);
    expect(onVerPropiedadesPorAntiguedad).toHaveBeenCalledWith("rojo");
  });

  it("un rango sin propiedades no navega", async () => {
    const { user, onVerPropiedadesPorAntiguedad } = montar();
    await user.click(screen.getByLabelText(/0 propiedades con 5–6 meses/i));
    expect(onVerPropiedadesPorAntiguedad).not.toHaveBeenCalled();
  });

  it("solo cuenta el inventario del asesor", () => {
    montar();
    // 4 propiedades propias, de las cuales 1 en riesgo (+4 meses reales: la roja)
    expect(screen.getByText(/de 4 con \+4 meses publicados/i)).toBeInTheDocument();
  });
});

describe("Salud inmobiliaria — cartera vacía", () => {
  it("no truena ni divide entre cero sin leads ni propiedades", () => {
    render(
      <SaludInmobiliaria
        asesor={asesor}
        leads={[]}
        propiedades={[]}
        onVolver={vi.fn()}
        onVerClientesPorEtapa={vi.fn()}
        onVerClientesPorRespuesta={vi.fn()}
        onVerClientesPorNivel={vi.fn()}
        onVerPropiedadesPorAntiguedad={vi.fn()}
      />,
    );
    expect(screen.getByText("0 de 0 clientes")).toBeInTheDocument();
    expect(screen.getByText(/no hay inventario que medir/i)).toBeInTheDocument();
  });
});

// Comportamiento compartido de diálogo modal: Escape cierra y el fondo deja
// de hacer scroll mientras está abierto. Es el mismo comportamiento que ya
// tenía GlassModal (components/GlassModal.tsx); este hook lo extrae para los
// modales que no pueden usar GlassModal todavía (tienen un pie de acciones
// fijo fuera del área con scroll, algo que GlassModal no soporta) pero deben
// comportarse igual — Escape y bloqueo de scroll son parte del contrato de
// "esto es un diálogo", no un detalle visual de GlassModal.
//
// Hallazgo de la auditoría UI/UX del 21 ago 2026 (A5): NuevoClienteModal,
// DescartarLeadModal y CalificarProspectoModal reconstruían el modal a mano
// sin esto — tres repeticiones de la misma falta, que es la señal para
// extraer un componente/hook en vez de seguir parchando cada instancia.
import { useEffect } from "react";

export function useDialogoAccesible(onCerrar: () => void) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflowPrevio;
    };
  }, [onCerrar]);
}

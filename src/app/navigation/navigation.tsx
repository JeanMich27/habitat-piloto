import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, Building2, CalendarDays, Calculator, ClipboardCheck, Contact, Globe, Home,
  LayoutDashboard, Settings, ShieldCheck, ShieldQuestion, Upload, User as UserIcon, Users,
} from "lucide-react";
import type { NavItem } from "../../components/AppShell";
import type { UserRole, Usuario } from "../../types";
import { puedeCargarPropiedades } from "../../types";

export type Vista =
  | "broker" | "propiedades" | "detalle" | "nueva" | "asesores" | "solicitudes"
  | "perfil" | "asesor" | "mi-perfil" | "mi-micrositio" | "propietario" | "cliente" | "intake"
  | "reportes" | "importar" | "comisiones" | "salud" | "clientes" | "agenda"
  | "configuracion";

export const ROLE_LABELS: Record<UserRole, string> = {
  broker: "Broker / Admin",
  asesor_independiente: "Asesor independiente",
  asesor_equipo: "Asesor de equipo",
  propietario: "Propietario",
  cliente: "Cliente",
};

export const INITIAL_VIEW: Record<UserRole, Vista> = {
  broker: "broker",
  asesor_independiente: "asesor",
  asesor_equipo: "asesor",
  propietario: "propietario",
  cliente: "cliente",
};

export function buildNavItems(role: UserRole | undefined, pendingUsers: number, todayAppointments: number): NavItem[] {
  const agenda = { id: "agenda", etiqueta: "Agenda", Icono: CalendarDays, badge: todayAppointments || undefined };
  switch (role) {
    case "broker": return [
      { id: "broker", etiqueta: "Dashboard", Icono: ShieldCheck },
      { id: "propiedades", etiqueta: "Propiedades", Icono: Building2 },
      { id: "clientes", etiqueta: "Clientes", Icono: Contact }, agenda,
      { id: "intake", etiqueta: "Validación", Icono: ClipboardCheck },
      { id: "asesores", etiqueta: "Asesores", Icono: Users },
      { id: "solicitudes", etiqueta: "Equipo", Icono: ShieldQuestion, badge: pendingUsers || undefined },
      { id: "reportes", etiqueta: "Reportes", Icono: BarChart3 },
      { id: "importar", etiqueta: "Importar", Icono: Upload },
      { id: "configuracion", etiqueta: "Configuración", Icono: Settings },
      { id: "mi-perfil", etiqueta: "Mi Perfil", Icono: UserIcon },
      { id: "mi-micrositio", etiqueta: "Mi Micrositio", Icono: Globe },
    ];
    case "asesor_independiente": return [
      { id: "asesor", etiqueta: "Dashboard", Icono: LayoutDashboard }, agenda,
      { id: "clientes", etiqueta: "Clientes", Icono: Contact },
      { id: "propiedades", etiqueta: "Propiedades", Icono: Building2 },
      { id: "comisiones", etiqueta: "Comisiones", Icono: Calculator },
      { id: "reportes", etiqueta: "Reportes", Icono: BarChart3 },
      { id: "mi-perfil", etiqueta: "Mi Perfil", etiquetaCorta: "Perfil", Icono: UserIcon },
      { id: "mi-micrositio", etiqueta: "Mi Micrositio", etiquetaCorta: "Micrositio", Icono: Globe },
      { id: "importar", etiqueta: "Importar", Icono: Upload },
    ];
    case "asesor_equipo": return [
      { id: "asesor", etiqueta: "Dashboard", Icono: LayoutDashboard }, agenda,
      { id: "clientes", etiqueta: "Clientes", Icono: Contact },
      { id: "propiedades", etiqueta: "Propiedades", Icono: Building2 },
      { id: "comisiones", etiqueta: "Comisiones", Icono: Calculator },
      { id: "mi-perfil", etiqueta: "Mi Perfil", etiquetaCorta: "Perfil", Icono: UserIcon },
      { id: "mi-micrositio", etiqueta: "Mi Micrositio", etiquetaCorta: "Micrositio", Icono: Globe },
    ];
    case "propietario": return [
      { id: "propietario", etiqueta: "Mi Propiedad", Icono: Home },
      { id: "mi-perfil", etiqueta: "Mi Perfil", etiquetaCorta: "Perfil", Icono: UserIcon },
    ];
    case "cliente": return [
      { id: "cliente", etiqueta: "Mi Proceso", Icono: Home },
      { id: "mi-perfil", etiqueta: "Mi Perfil", etiquetaCorta: "Perfil", Icono: UserIcon },
    ];
    default: return [];
  }
}

export function allowedViews(items: NavItem[], role: UserRole | undefined): Set<Vista> {
  const views = new Set(items.map((item) => item.id as Vista));
  if (views.has("propiedades")) {
    views.add("detalle");
    if (role && puedeCargarPropiedades(role)) views.add("nueva");
  }
  if (views.has("asesores")) views.add("perfil");
  if (views.has("comisiones")) views.add("salud");
  return views;
}

export function useAppNavigation(user: Usuario | null, pendingUsers: number, todayAppointments: number) {
  const [vista, setVista] = useState<Vista | null>(null);
  const fromPopstate = useRef(false);
  const items = useMemo(
    () => buildNavItems(user?.rol, pendingUsers, todayAppointments),
    [user?.rol, pendingUsers, todayAppointments],
  );
  const permitted = useMemo(() => allowedViews(items, user?.rol), [items, user?.rol]);

  useEffect(() => {
    setVista(user ? INITIAL_VIEW[user.rol] : null);
  }, [user]);

  useEffect(() => {
    if (!vista) return;
    if (fromPopstate.current) {
      fromPopstate.current = false;
      return;
    }
    const current = (window.history.state ?? {}) as { vista?: Vista };
    if (current.vista === vista) return;
    if (current.vista == null) window.history.replaceState({ vista }, "");
    else window.history.pushState({ vista }, "");
  }, [vista]);

  useEffect(() => {
    const navigateBack = (event: PopStateEvent) => {
      const previous = (event.state as { vista?: Vista } | null)?.vista;
      if (!previous || !permitted.has(previous)) return;
      fromPopstate.current = true;
      setVista(previous);
    };
    window.addEventListener("popstate", navigateBack);
    return () => window.removeEventListener("popstate", navigateBack);
  }, [permitted]);

  useEffect(() => {
    if (user && vista && !permitted.has(vista)) setVista(INITIAL_VIEW[user.rol]);
  }, [vista, permitted, user]);

  return { vista, setVista, navItems: items };
}

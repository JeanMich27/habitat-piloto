import { useEffect, useMemo, useRef, useState } from "react";
import db from "../../data/db.json";
import { NOTIFICACIONES_DEFAULT } from "../../data/configuracionOpciones";
import type { AgenciaInfo, Lead, Propiedad, SolicitudEstado, Usuario } from "../../types";
import { esLeadEnSeguimiento, esLeadOperativo } from "../../types";
import {
  cargarSnapshotLocal,
  fetchInitialData,
  fetchSolicitudes,
  guardarSnapshotLocal,
  reemplazarEnArreglo,
  sembrarDatosDeEjemplo,
  suscribirCambiosEnVivo,
  type EstadoCompleto,
  type MetricasPropietario,
} from "../../lib/dataStore";
import { isCloudEnabled, isDemoMode } from "../../lib/supabaseClient";

const DEMO_USER_KEY = "habitat-demo-usuario";

export const factorySnapshot: EstadoCompleto = {
  propiedades: db.propiedades as Propiedad[],
  leads: db.leads as Lead[],
  usuarios: db.usuarios as Usuario[],
  citas: [],
  agencia: db.agencia as AgenciaInfo,
  permisoEquipoVerTodas: false,
  notificaciones: NOTIFICACIONES_DEFAULT,
};

interface UseAppDataInput {
  perfil: Usuario | null;
  cloudSessionPresent: boolean;
}

/**
 * Estado de aplicación y sincronización de datos.
 *
 * Esta es la frontera React de la capa Application: App coordina vistas, pero
 * no conoce cómo se hidrata, refresca, persiste localmente o escucha Supabase.
 */
export function useAppData({ perfil, cloudSessionPresent }: UseAppDataInput) {
  const initial = useMemo<EstadoCompleto>(() => {
    if (isDemoMode) {
      const local = cargarSnapshotLocal();
      return { ...factorySnapshot, ...local };
    }
    // En nube se inicia vacío: si falla la lectura, nunca se presentan datos
    // demo como si fueran datos reales de la oficina.
    return {
      propiedades: [], leads: [], usuarios: [], citas: [],
      agencia: { nombre: "", direccion: "" },
      permisoEquipoVerTodas: false,
      notificaciones: {},
    };
  }, []);

  const [propiedades, setPropiedades] = useState(initial.propiedades);
  const [leads, setLeads] = useState(initial.leads);
  const [usuarios, setUsuarios] = useState(initial.usuarios);
  const [citas, setCitas] = useState(initial.citas ?? []);
  const [solicitudes, setSolicitudes] = useState<SolicitudEstado[]>([]);
  const [agencia, setAgencia] = useState(initial.agencia);
  const [permisoEquipoVerTodas, setPermisoEquipoVerTodas] = useState(initial.permisoEquipoVerTodas);
  const [notificaciones, setNotificaciones] = useState(initial.notificaciones);
  const [metricasPropietario, setMetricasPropietario] = useState<Record<string, MetricasPropietario>>(
    initial.metricasPropietario ?? {},
  );
  const [errorMetricasPropietario, setErrorMetricasPropietario] = useState<string | null>(
    initial.errorMetricasPropietario ?? null,
  );
  const [cargandoNube, setCargandoNube] = useState(false);
  const [avisoNube, setAvisoNube] = useState<string | null>(null);
  const [demoUsuarioId, setDemoUsuarioId] = useState<string | null>(() =>
    isDemoMode ? window.localStorage.getItem(DEMO_USER_KEY) : null,
  );

  const usuarioActual = isCloudEnabled
    ? perfil
    : usuarios.find((usuario) => usuario.id === demoUsuarioId) ?? null;
  const sesionActiva = isCloudEnabled
    ? Boolean(cloudSessionPresent && perfil?.estadoCuenta === "Activo")
    : Boolean(usuarioActual);
  const leadsOperativos = useMemo(() => leads.filter(esLeadOperativo), [leads]);
  const leadsEnSeguimiento = useMemo(() => leads.filter(esLeadEnSeguimiento), [leads]);
  const yaSembrado = useRef(false);

  const applySnapshot = (snapshot: EstadoCompleto) => {
    setPropiedades(snapshot.propiedades);
    setLeads(snapshot.leads);
    setUsuarios(snapshot.usuarios);
    setCitas(snapshot.citas);
    setMetricasPropietario(snapshot.metricasPropietario ?? {});
    setErrorMetricasPropietario(snapshot.errorMetricasPropietario ?? null);
    setAgencia(snapshot.agencia);
    setPermisoEquipoVerTodas(snapshot.permisoEquipoVerTodas);
    setNotificaciones(snapshot.notificaciones);
  };

  useEffect(() => {
    if (!isCloudEnabled || !sesionActiva) return;
    let active = true;
    setCargandoNube(true);
    void (async () => {
      try {
        let snapshot = await fetchInitialData();
        const empty = snapshot && snapshot.propiedades.length === 0 && snapshot.leads.length === 0;
        if (snapshot && empty && usuarioActual?.rol === "broker" && !yaSembrado.current) {
          yaSembrado.current = true;
          const seed = await sembrarDatosDeEjemplo(factorySnapshot);
          if (!seed.ok) throw new Error(seed.error.message);
          snapshot = await fetchInitialData();
        }
        if (!active || !snapshot) return;
        applySnapshot(snapshot);
        void fetchSolicitudes().then((items) => active && setSolicitudes(items));
        setAvisoNube(null);
      } catch (error) {
        console.error("[Supabase] fetchInitialData", error);
        if (active) setAvisoNube("No se pudo conectar con la base de datos. Intenta recargar.");
      } finally {
        if (active) setCargandoNube(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [sesionActiva, usuarioActual?.rol]);

  useEffect(() => {
    if (!isCloudEnabled || !sesionActiva) return;
    return suscribirCambiosEnVivo({
      onPropiedad: (item) => setPropiedades((current) => reemplazarEnArreglo(current, item)),
      onPropiedadEliminada: (id) => setPropiedades((current) => current.filter((item) => item.id !== id)),
      onLead: (item) => setLeads((current) => reemplazarEnArreglo(current, item)),
      onUsuario: (item) => setUsuarios((current) => reemplazarEnArreglo(current, item)),
      onAgencia: setAgencia,
      onConfiguracion: (config) => {
        setPermisoEquipoVerTodas(config.permisoEquipoVerTodas);
        setNotificaciones(config.notificaciones);
      },
      onCita: (item) => setCitas((current) => reemplazarEnArreglo(current, item)),
      onCitaEliminada: (id) => setCitas((current) => current.filter((item) => item.id !== id)),
      onSolicitud: (item) => setSolicitudes((current) => reemplazarEnArreglo(current, item)),
    });
  }, [sesionActiva]);

  useEffect(() => {
    if (!isCloudEnabled || !sesionActiva) return;
    let lastRead = Date.now();
    const refreshAfterAbsence = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRead < 120_000) return;
      lastRead = Date.now();
      try {
        const snapshot = await fetchInitialData();
        if (!snapshot) return;
        applySnapshot(snapshot);
        void fetchSolicitudes().then(setSolicitudes);
      } catch (error) {
        console.warn("[Supabase] no se pudo refrescar al volver a la pestaña", error);
      }
    };
    document.addEventListener("visibilitychange", refreshAfterAbsence);
    window.addEventListener("focus", refreshAfterAbsence);
    return () => {
      document.removeEventListener("visibilitychange", refreshAfterAbsence);
      window.removeEventListener("focus", refreshAfterAbsence);
    };
  }, [sesionActiva]);

  useEffect(() => {
    if (isCloudEnabled) return;
    guardarSnapshotLocal({
      propiedades,
      leads,
      usuarios,
      citas,
      agencia,
      permisoEquipoVerTodas,
      notificaciones,
    });
  }, [propiedades, leads, usuarios, citas, agencia, permisoEquipoVerTodas, notificaciones]);

  const clearDemoUser = () => {
    window.localStorage.removeItem(DEMO_USER_KEY);
    setDemoUsuarioId(null);
  };

  const selectDemoUser = (id: string) => {
    window.localStorage.setItem(DEMO_USER_KEY, id);
    setDemoUsuarioId(id);
  };

  return {
    propiedades, setPropiedades,
    leads, setLeads, leadsOperativos, leadsEnSeguimiento,
    usuarios, setUsuarios,
    citas, setCitas,
    solicitudes, setSolicitudes,
    agencia, setAgencia,
    permisoEquipoVerTodas, setPermisoEquipoVerTodas,
    notificaciones, setNotificaciones,
    metricasPropietario, errorMetricasPropietario,
    usuarioActual, clearDemoUser, selectDemoUser,
    cargandoNube, avisoNube, setAvisoNube,
  };
}

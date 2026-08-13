// Agencia (oficina) de la sesión actual.
//
// Con el modelo multi-tenant, TODA escritura debe llevar `agencia_id`. Los
// conversores de fila (rowMappers) son funciones puras sin acceso al contexto
// de React, así que la agencia vive aquí: se fija una sola vez al cargar el
// perfil autenticado y se limpia al cerrar sesión.
//
// ¿Por qué un valor de módulo y no un contexto? Porque un navegador equivale a
// una sesión y una sesión pertenece a una sola oficina. Meterlo en el contexto
// obligaría a pasar el id por cada vista y cada llamada; el beneficio sería
// nulo.
//
// Red de seguridad: si este valor quedara mal por un error, RLS rechaza la
// escritura (`with check agencia_id = mi_agencia_id()`). El peor caso posible
// es un error visible en pantalla, nunca un registro guardado en la oficina
// equivocada.

let agenciaActual: string | null = null;

export function setAgenciaActual(id: string | null): void {
  agenciaActual = id ?? null;
}

/** Devuelve la agencia o null. Úsalo cuando la ausencia es un caso válido. */
export function agenciaActualONull(): string | null {
  return agenciaActual;
}

/** Devuelve la agencia o lanza. Úsalo en cualquier ruta de escritura. */
export function getAgenciaActual(): string {
  if (!agenciaActual) {
    throw new Error(
      "No hay oficina asociada a esta sesión. Cierra sesión y vuelve a entrar; " +
        "si el problema sigue, tu cuenta está pendiente de aprobación.",
    );
  }
  return agenciaActual;
}

export function hayAgencia(): boolean {
  return agenciaActual !== null;
}

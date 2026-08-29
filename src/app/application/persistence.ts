import type { Dispatch, SetStateAction } from "react";
import type { OperationResult } from "../../lib/dataStore";

export type StateSetter<T> = Dispatch<SetStateAction<T>>;
export type ConfirmPersistence = <T = undefined>(
  operation: () => Promise<OperationResult<T>>,
  apply: () => void,
) => Promise<boolean>;

export function createPersistenceCoordinator(
  cloudEnabled: boolean,
  setError: StateSetter<string | null>,
): ConfirmPersistence {
  return async <T,>(operation: () => Promise<OperationResult<T>>, apply: () => void) => {
    if (!cloudEnabled) {
      apply();
      return true;
    }
    const result = await operation();
    if (!result.ok) {
      // Una mutación rechazada no significa que los datos iniciales hayan
      // dejado de cargar. El componente que inició la acción recibe `false`
      // y muestra su error local; no sustituimos toda la app por la pantalla
      // fatal de carga (esto ocurría al asociar una foto de perfil).
      setError(result.error.message);
      return false;
    }
    apply();
    setError(null);
    return true;
  };
}

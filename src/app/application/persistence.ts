import type { Dispatch, SetStateAction } from "react";
import type { OperationResult } from "../../lib/dataStore";

export type StateSetter<T> = Dispatch<SetStateAction<T>>;
export type ConfirmPersistence = (
  operation: () => Promise<OperationResult>,
  apply: () => void,
) => Promise<boolean>;

export function createPersistenceCoordinator(
  cloudEnabled: boolean,
  setError: StateSetter<string | null>,
): ConfirmPersistence {
  return async (operation, apply) => {
    if (!cloudEnabled) {
      apply();
      return true;
    }
    const result = await operation();
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    apply();
    setError(null);
    return true;
  };
}

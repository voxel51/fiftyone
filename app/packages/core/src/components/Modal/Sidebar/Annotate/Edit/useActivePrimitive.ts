import { atom, useAtom } from "jotai";
import { useMemo } from "react";
import { useIsPrimitiveField } from "../SchemaManager/hooks";

// the path of the primitive that is currently being edited
export const activePrimitiveAtom = atom<string | null>(null);

export const useActivePrimitive = () => {
  return useAtom(activePrimitiveAtom);
};

export interface PrimitiveController {
  /**
   * Get the current active primitive field.
   */
  activePrimitive: string | null;

  /**
   * Returns `true` if the provided path is a primitive field, else `false`.
   *
   * @param path Path to check
   */
  isPrimitive: (path: string) => boolean;

  /**
   * Set the current active primitive field.
   *
   * Setting this value will open the primitive for editing in the annotation
   * sidebar.
   *
   * @param path Path to activate, or `null` to clear
   */
  setActivePrimitive: (path: string | null) => void;
}

/**
 * Hook which returns a {@link PrimitiveController}.
 */
export const usePrimitiveController = (): PrimitiveController => {
  const [activePrimitive, setActivePrimitive] = useAtom(activePrimitiveAtom);
  const isPrimitive = useIsPrimitiveField();

  return useMemo(
    () => ({
      activePrimitive,
      isPrimitive,
      setActivePrimitive,
    }),
    [activePrimitive, isPrimitive, setActivePrimitive]
  );
};

export default useActivePrimitive;

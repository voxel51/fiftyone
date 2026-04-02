import { useMemo } from "react";
import { useActivePrimitiveState } from "../redux/hooks";
import { useIsPrimitiveField } from "../SchemaManager/hooks";

export const useActivePrimitive = () => {
  return useActivePrimitiveState();
};

export interface PrimitiveController {
  activePrimitive: string | null;
  isPrimitive: (path: string) => boolean;
  setActivePrimitive: (path: string | null) => void;
}

export const usePrimitiveController = (): PrimitiveController => {
  const [activePrimitive, setActivePrimitive] = useActivePrimitiveState();
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

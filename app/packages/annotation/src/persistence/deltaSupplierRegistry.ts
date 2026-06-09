import { atom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import type { DeltaSupplier } from "./deltaSupplier";

/** Suppliers registered by feature surfaces outside the annotation package. */
const registeredSuppliersAtom = atom<readonly DeltaSupplier[]>([]);

/**
 * Register a {@link DeltaSupplier} with the annotation aggregator for the
 * lifetime of the calling component. Lets a feature surface (e.g. video
 * annotation) contribute deltas without the aggregator importing it, keeping
 * the package dependency one-directional.
 */
export const useRegisterDeltaSupplier = (supplier: DeltaSupplier): void => {
  const setSuppliers = useSetAtom(registeredSuppliersAtom);

  useEffect(() => {
    setSuppliers((prev) => [...prev, supplier]);

    return () => {
      setSuppliers((prev) => prev.filter((entry) => entry !== supplier));
    };
  }, [setSuppliers, supplier]);
};

/** The suppliers currently registered via {@link useRegisterDeltaSupplier}. */
export const useRegisteredDeltaSuppliers = (): readonly DeltaSupplier[] =>
  useAtomValue(registeredSuppliersAtom);

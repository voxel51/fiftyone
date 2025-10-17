import { AnnotationLabel } from "@fiftyone/state";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { currentData } from "./state";

const savedLabel = atom<AnnotationLabel["data"] | null>(null);

export default function useHasChanges() {
  const label = useAtomValue(currentData);
  const saved = useAtomValue(savedLabel);

  useEffect(() => {
    const store = getDefaultStore();
    store.set(savedLabel, store.get(currentData));
  }, []);

  return useMemo(() => {
    return saved === null
      ? false
      : JSON.stringify(label) !== JSON.stringify(saved);
  }, [label, saved]);
}

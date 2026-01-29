import { useAnnotationEventBus } from "@fiftyone/annotation";
import { atom, useAtom, useAtomValue } from "jotai";
import { useCallback } from "react";
import { current } from "./state";

export const isSavingAtom = atom(false);

export default function useSave() {
  const label = useAtomValue(current);
  const [isSaving, setSaving] = useAtom(isSavingAtom);
  const eventBus = useAnnotationEventBus();

  return useCallback(() => {
    if (!label || isSaving) {
      return;
    }

    setSaving(true);
    eventBus.dispatch("annotation:persistenceRequested");
    setSaving(false);
  }, [label, isSaving, eventBus, setSaving]);
}

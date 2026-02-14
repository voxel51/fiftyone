import { useAnnotationEventBus } from "@fiftyone/annotation";
import type { BaseOverlay } from "@fiftyone/lighter";
import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { addValue, current, savedLabel } from "./state";
import useExit from "./useExit";

export const isSavingAtom = atom(false);

/**
 * Hook for saving annotation labels.
 * @param stayInEditMode - If true, stays in edit mode after saving (useful for patches view).
 *                         If false (default), exits edit mode after saving.
 */
export default function useSave(stayInEditMode = false) {
  const eventBus = useAnnotationEventBus();
  const { scene, addOverlay } = useLighter();
  const label = useAtomValue(current);
  const setter = useSetAtom(addValue);
  const saved = useSetAtom(savedLabel);
  const [isSaving, setSaving] = useAtom(isSavingAtom);
  const exit = useExit();
  const setNotification = fos.useNotification();

  return useCallback(async () => {
    if (!label || isSaving) {
      return;
    }

    setSaving(true);

    try {
      // Dispatch persistence request - the delta suppliers will build and send the changes
      eventBus.dispatch("annotation:persistenceRequested");

      setter();

      if (scene && !scene.isDestroyed && scene.renderLoopActive) {
        scene.exitInteractiveMode();
        addOverlay(label.overlay as BaseOverlay);
      }

      saved(label.data);
      setSaving(false);

      if (!stayInEditMode) {
        exit();
      }
    } catch (error) {
      setSaving(false);
      console.error("Error saving label:", error);
      setNotification({
        msg: `Label "${
          label.data.label ?? "Label"
        }" not saved successfully. See console for details and try again.`,
        variant: "error",
      });
    }
  }, [
    eventBus,
    label,
    isSaving,
    scene,
    addOverlay,
    setter,
    saved,
    exit,
    setNotification,
    stayInEditMode,
  ]);
}

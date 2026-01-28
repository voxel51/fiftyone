import { getFieldSchema, UpsertAnnotationCommand } from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import type { BaseOverlay } from "@fiftyone/lighter";
import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { CLASSIFICATION, DETECTION } from "@fiftyone/utilities";
import { atom, getDefaultStore, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import {
  addValue,
  quickDrawActiveAtom,
  currentAnnotationModeAtom,
  current,
  editing,
  savedLabel,
  type LabelType,
} from "./state";
import { useAutoAssignment } from "./useAutoAssignment";
import useCreate from "./useCreate";
import useExit from "./useExit";

export const isSavingAtom = atom(false);

export default function useSave() {
  const commandBus = useCommandBus();
  const { scene, addOverlay } = useLighter();
  const label = useAtomValue(current);
  const setter = useSetAtom(addValue);
  const saved = useSetAtom(savedLabel);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );
  const [isSaving, setSaving] = useAtom(isSavingAtom);
  const exit = useExit(false);
  const setNotification = fos.useNotification();
  const { updateLastUsed } = useAutoAssignment();
  const quickDrawActive = useAtomValue(quickDrawActiveAtom);
  const currentAnnotationMode = useAtomValue(currentAnnotationModeAtom);
  const createClassification = useCreate(CLASSIFICATION);
  const createDetection = useCreate(DETECTION);

  return useCallback(async () => {
    if (!label || isSaving) {
      return;
    }

    setSaving(true);

    try {
      const fieldSchema = getFieldSchema(schema, label.path);
      if (!fieldSchema) {
        setSaving(false);
        setNotification({
          msg: `Unable to save label: field schema not found for path "${
            label.path ?? "unknown"
          }".`,
          variant: "error",
        });
        return;
      }

      await commandBus.execute(
        new UpsertAnnotationCommand({ ...label }, fieldSchema)
      );

      setter();

      saved(label.data);
      setSaving(false);

      // Always exit interactive mode after save
      // This ensures clean state transition
      if (scene && !scene.isDestroyed && scene.renderLoopActive) {
        scene.exitInteractiveMode();
        addOverlay(label.overlay as BaseOverlay);
      }

      // Check if we're in quick draw mode
      if (quickDrawActive && currentAnnotationMode) {
        // Update last-used values for auto-assignment
        const labelType: LabelType = currentAnnotationMode as LabelType;
        updateLastUsed(labelType, label.path, label.data.label);

        // Create next label immediately
        // This will enter interactive mode with a new handler
        if (currentAnnotationMode === "Classification") {
          createClassification();
        } else if (currentAnnotationMode === "Detection") {
          createDetection();
        }

        setNotification({
          msg: `Label "${label.data.label}" saved. Ready for next...`,
          variant: "success",
        });
      } else {
        // Normal flow: exit
        exit();
        setNotification({
          msg: `Label "${label.data.label}" saved successfully.`,
          variant: "success",
        });
      }
    } catch (error) {
      setSaving(false);
      setNotification({
        msg: `Label "${
          label.data.label ?? "Label"
        }" not saved successfully. Try again.`,
        variant: "error",
      });
    }
  }, [
    commandBus,
    label,
    isSaving,
    schema,
    scene,
    addOverlay,
    setter,
    saved,
    exit,
    setNotification,
    quickDrawActive,
    currentAnnotationMode,
    updateLastUsed,
    createClassification,
    createDetection,
  ]);
}

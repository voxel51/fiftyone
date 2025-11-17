import {
  getFieldSchema,
  useAnnotationEventBus,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import { generateSourceId } from "@fiftyone/events";
import type { BaseOverlay } from "@fiftyone/lighter";
import { useLighter } from "@fiftyone/lighter";
import type { AnnotationLabel } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
import { useRecoilValue } from "recoil";
import { addValue, current, savedLabel } from "./state";
import useExit from "./useExit";

export const isSaving = atom(false);

export default function useSave() {
  const { scene, addOverlay } = useLighter();
  const eventBus = useAnnotationEventBus();
  const label = useAtomValue(current);
  const setter = useSetAtom(addValue);
  const saved = useSetAtom(savedLabel);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );
  const setSaving = useSetAtom(isSaving);
  const exit = useExit(false);
  const setNotification = fos.useNotification();

  const sourceIdRef = useRef<string | null>(null);

  // Capture a stable snapshot of label data at dispatch time to avoid stale closures
  const labelSnapshotRef = useRef<{
    overlay: AnnotationLabel["overlay"] & { id: string };
    labelData: AnnotationLabel["data"];
    labelName: string;
  } | null>(null);

  useAnnotationEventHandler(
    "annotation:notification:upsertSuccess",
    useCallback(
      (payload) => {
        // Only process if this notification is for our mutation
        if (payload.sourceId !== sourceIdRef.current) {
          return;
        }

        if (payload.type !== "upsert") {
          return;
        }

        // Clear the sourceId after processing
        sourceIdRef.current = null;

        const snapshot = labelSnapshotRef.current;
        labelSnapshotRef.current = null;

        if (!snapshot) {
          setSaving(false);
          return;
        }

        setter();

        if (scene && scene.renderLoopActive) {
          scene.exitInteractiveMode();
          addOverlay(snapshot.overlay as BaseOverlay);
        }

        saved(snapshot.labelData);
        setSaving(false);
        exit();
        setNotification({
          msg: `Label "${snapshot.labelName}" saved successfully.`,
          variant: "success",
        });
      },
      [scene, addOverlay, exit, setter, saved, setSaving, setNotification]
    )
  );

  useAnnotationEventHandler(
    "annotation:notification:upsertError",
    useCallback(
      (payload) => {
        // Only process if this notification is for our mutation
        if (payload.sourceId !== sourceIdRef.current) {
          return;
        }

        if (payload.type !== "upsert") {
          return;
        }

        // Clear the sourceId after processing
        sourceIdRef.current = null;

        const snapshot = labelSnapshotRef.current;
        labelSnapshotRef.current = null;

        if (!snapshot) {
          setSaving(false);
          return;
        }

        setSaving(false);
        setNotification({
          msg: `Label "${snapshot.labelName}" not saved successfully. Try again.`,
          variant: "error",
        });
      },
      [setSaving, setNotification]
    )
  );

  return useCallback(() => {
    if (!label) {
      return;
    }

    setSaving(true);

    sourceIdRef.current = generateSourceId(
      `save-${label.data.label}-${label.data._id}`
    );

    // Capture a stable snapshot of label data at dispatch time
    // to avoid stale references in async success/error handlers
    labelSnapshotRef.current = {
      overlay: label.overlay,
      labelData: label.data,
      labelName: label.data.label ?? "Label",
    };

    eventBus.dispatch("annotation:command:upsert", {
      sourceId: sourceIdRef.current,
      label: { ...label },
      schema: getFieldSchema(schema, label.path)!,
    });
  }, [eventBus, label, schema]);
}

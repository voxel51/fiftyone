import {
  useAnnotationEventBus,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import { generateSourceId } from "@fiftyone/events";
import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
import { useRecoilValue } from "recoil";
import { getFieldSchema } from "../../../Lighter/deltas";
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

        setter();

        if (scene && scene.renderLoopActive) {
          scene.exitInteractiveMode();
          addOverlay(label.overlay);
        }

        saved(label.data);
        setSaving(false);
        exit();
        setNotification({
          msg: `Label "${label.data.label}" saved successfully.`,
          variant: "success",
        });
      },
      [
        scene,
        addOverlay,
        exit,
        label,
        setter,
        saved,
        setSaving,
        setNotification,
      ]
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

        setSaving(false);
        setNotification({
          msg: `Label "${label.data.label}" not saved successfully. Try again.`,
          variant: "error",
        });
      },
      [label, setSaving, setNotification]
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

    eventBus.dispatch("annotation:command:upsert", {
      sourceId: sourceIdRef.current,
      label: { ...label },
      schema: getFieldSchema(schema, label.path)!,
    });
  }, [eventBus, label, schema]);
}

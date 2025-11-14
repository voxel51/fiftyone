import {
  useAnnotationEventBus,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import { generateSourceId } from "@fiftyone/events";
import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
import { useRecoilValue } from "recoil";
import { getFieldSchema } from "../../../Lighter/deltas";
import { current, deleteValue } from "./state";
import useExit from "./useExit";
import { isSaving } from "./useSave";

export default function useDelete() {
  const { scene, removeOverlay } = useLighter();
  const eventBus = useAnnotationEventBus();
  const label = useAtomValue(current);
  const setter = useSetAtom(deleteValue);
  const schema = useRecoilValue(
    fos.fieldSchema({ space: fos.State.SPACE.SAMPLE })
  );

  const exit = useExit(false);
  const setSaving = useSetAtom(isSaving);
  const setNotification = fos.useNotification();

  const sourceIdRef = useRef<string | null>(null);

  useAnnotationEventHandler(
    "annotation:notification:deleteSuccess",
    useCallback(
      (payload) => {
        // Only process if this notification is for our mutation
        if (payload.sourceId !== sourceIdRef.current) {
          return;
        }

        if (payload.type !== "delete") {
          return;
        }

        // Clear the sourceId after processing
        sourceIdRef.current = null;

        removeOverlay(label?.overlay.id);
        setter();
        setSaving(false);
        setNotification({
          msg: `Label "${label.data.label}" successfully deleted.`,
          variant: "success",
        });
        exit();
      },
      [label, removeOverlay, setter, setSaving, setNotification]
    )
  );

  useAnnotationEventHandler(
    "annotation:notification:deleteError",
    useCallback(
      (payload) => {
        // Only process if this notification is for our mutation
        if (payload.sourceId !== sourceIdRef.current) {
          return;
        }

        if (payload.type !== "delete") {
          return;
        }

        // Clear the sourceId after processing
        sourceIdRef.current = null;

        setSaving(false);
        setNotification({
          msg: `Label "${label.data.label}" not successfully deleted. Try again.`,
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

    if (label.isNew) {
      scene?.exitInteractiveMode();
      removeOverlay(label?.data._id);
      exit();
      return;
    }

    setSaving(true);

    sourceIdRef.current = generateSourceId(
      `delete-${label.data.label}-${label.data._id}`
    );

    eventBus.dispatch("annotation:command:delete", {
      sourceId: sourceIdRef.current,
      label,
      schema: getFieldSchema(schema, label?.path)!,
    });
  }, [eventBus, label, scene, schema, setSaving]);
}

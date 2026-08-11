import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import type { Native2dLabel } from "./types";

/**
 * Filters stored 2D labels down to the ones the sidebar would show.
 *
 * Visibility follows the sidebar, but only for paths the sidebar actually
 * knows about. A field that lives on the image slices without being in the
 * main (point-cloud slice) schema never appears in `activeFields`, so keying
 * purely off membership there hid every such label -- which is why none of
 * these were showing up at all.
 */
export const useVisibleNative2dLabels = (
  labels: Native2dLabel[],
): Native2dLabel[] => {
  const activeFields = fos.useActiveFields({ modal: true });
  const knownLabelFields = fos.useLabelFields({
    space: fos.State.SPACE.SAMPLE,
  });

  return useMemo(() => {
    const active = new Set(activeFields);
    const known = new Set(knownLabelFields);
    return labels.filter((l) => !known.has(l.path) || active.has(l.path));
  }, [labels, activeFields, knownLabelFields]);
};

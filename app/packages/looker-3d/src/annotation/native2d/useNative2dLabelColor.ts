import { getLabelColor } from "@fiftyone/looker/src/overlays/util";
import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import type { Native2dLabel } from "./types";

/**
 * Returns a resolver that colors a stored 2D label using the app's color scheme
 * (color-by-field / value / instance), matching how the same labels are colored
 * in Explore mode.
 */
export const useNative2dLabelColor = (): ((label: Native2dLabel) => string) => {
  const coloring = useRecoilValue(fos.coloring);
  const colorScheme = useRecoilValue(fos.colorScheme);

  return useCallback(
    (label: Native2dLabel): string =>
      getLabelColor({
        coloring,
        path: label.path,
        // Minimal label shape: color-by-field uses `path`, color-by-value uses
        // `label`. We don't carry tags into the side-slice overlay.
        label: { id: label._id, label: label.label, tags: [] },
        isTagged: false,
        labelTagColors: colorScheme.labelTags,
        customizeColorSetting: colorScheme.fields ?? [],
        embeddedDocType: label._cls,
      } as Parameters<typeof getLabelColor>[0]),
    [coloring, colorScheme],
  );
};

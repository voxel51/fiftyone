import { RENDER_STATUS_PAINTING } from "@fiftyone/looker/src/worker/shared";
import type Spotlight from "@fiftyone/spotlight";
import type { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useCallback, useEffect } from "react";
import { useRecoilValue } from "recoil";
import { useDetectNewActiveLabelFields } from "../Sidebar/useDetectNewActiveLabelFields";
import type { LookerCache } from "./types";

const handleNewOverlays = (entry: fos.Lookers, newFields: string[]) => {
  const overlays = entry.getSampleOverlays() ?? [];
  const changed = overlays.filter(
    (o) =>
      o.field &&
      (o.label?.mask_path?.length > 0 ||
        o.label?.map_path?.length > 0 ||
        o.label?.mask ||
        o.label?.map) &&
      newFields.includes(o.field)
  );

  for (const overlay of changed) {
    if (overlay.label) {
      // "pending" means we're marking this label for rendering or
      // painting, even if it's interrupted, say by unchecking sidebar
      overlay.label._renderStatus = RENDER_STATUS_PAINTING;
    }
  }

  changed?.length && entry.refreshSample(newFields);
};

const handleChangedOverlays = (entry: fos.Lookers) => {
  const overlays = entry.getSampleOverlays() ?? [];
  const rerender: string[] = [];
  for (const overlay of overlays) {
    if (!overlay.field) {
      continue;
    }

    if (overlay?.label?._renderStatus !== RENDER_STATUS_PAINTING) {
      continue;
    }

    rerender.push(overlay.field);
  }

  // if there are any labels marked "pending", render them
  rerender.length && entry.refreshSample(rerender);
};

const useItemUpdater = (
  cache: LookerCache,
  options: ReturnType<typeof fos.useLookerOptions>
) => {
  const { getNewFields } = useDetectNewActiveLabelFields({ modal: false });
  const selected = useRecoilValue(fos.selectedSamples);

  return useCallback(
    (fontSize: number) => {
      return (id: ID) => {
        const entry = cache.get(id.description);
        if (!entry) {
          return;
        }

        entry.updateOptions({
          ...options,
          fontSize,
          selected: selected.has(id.description),
        });

        const newFields = getNewFields(id.description);
        // rerender looker if active fields have changed and have never been
        // rendered before
        newFields?.length
          ? handleNewOverlays(entry, newFields)
          : handleChangedOverlays(entry);
      };
    },
    [cache, getNewFields, options, selected]
  );
};

export default function useUpdates({
  cache,
  getFontSize,
  options,
  spotlight,
}: {
  cache: LookerCache;
  getFontSize: () => number;
  options: ReturnType<typeof fos.useLookerOptions>;
  spotlight?: Spotlight<number, fos.Sample>;
}) {
  const { init, deferred } = fos.useDeferrer();
  const itemUpdater = useItemUpdater(cache, options);

  useEffect(() => {
    deferred(() => {
      spotlight?.updateItems(itemUpdater(getFontSize()));
      cache.empty();
    });
  }, [cache, deferred, getFontSize, itemUpdater, spotlight]);

  useEffect(() => {
    return spotlight ? init() : undefined;
  }, [spotlight, init]);
}

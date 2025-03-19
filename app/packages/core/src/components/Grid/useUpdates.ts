import { RENDER_STATUS_PAINTING } from "@fiftyone/looker/src/worker/shared";
import type Spotlight from "@fiftyone/spotlight";
import type { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { debounce } from "lodash";
import { useCallback, useEffect } from "react";
import { useRecoilValue } from "recoil";
import { useDetectNewActiveLabelFields } from "../Sidebar/useDetectNewActiveLabelFields";
import type { LookerCache } from "./types";

const handleNewOverlays = (
  entry: fos.Lookers,
  newFields: string[],
  options: { filter; activeFields: string[] }
) => {
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
  entry.refreshSample(newFields, {
    filter: options.filter,
    options: { activePaths: options.activeFields },
  });
};

const handleChangedOverlays = (
  entry: fos.Lookers,
  options: ReturnType<typeof fos.useLookerOptions>
) => {
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

  const { coloring, colorscale, customizeColorSetting, labelTagColors } =
    options;
  if (!coloring || !colorscale || !customizeColorSetting || !labelTagColors) {
    throw new Error("unexpected");
  }

  const refreshOptions = {
    coloring,
    colorscale,
    customizeColorSetting,
    labelTagColors,
  };

  // if there are any labels marked "pending", render them
  if (rerender.length) {
    entry.refreshSample(rerender, {
      filter: options.filter,
      options: refreshOptions,
    });
  }
  return true;
};

const useFieldUpdater = (cache: LookerCache) => {
  const { getNewFields } = useDetectNewActiveLabelFields({ modal: false });
  const activeFields = useRecoilValue(fos.activeFields({ modal: false }));
  const filter = useRecoilValue(fos.pathFilter(false));

  return useCallback(() => {
    return (id: ID) => {
      const entry = cache.get(id.description);
      if (!entry) {
        return;
      }

      const newFields = getNewFields(id.description);
      // rerender looker if active fields have changed and have never been
      // rendered before
      if (newFields?.length) {
        handleNewOverlays(entry, newFields, { filter, activeFields });
      }
    };
  }, [activeFields, cache, filter, getNewFields]);
};

const useColorUpdater = (cache: LookerCache) => {
  const options = fos.useSampleOptions(false);

  return useCallback(() => {
    return (id: ID) => {
      const entry = cache.get(id.description);
      if (!entry) {
        return;
      }

      entry.updateSampleOptions(options);
    };
  }, [cache, options]);
};

export default function useUpdates({
  cache,
  spotlight,
}: {
  cache: LookerCache;
  getFontSize: () => number;
  options: ReturnType<typeof fos.useLookerOptions>;
  spotlight?: Spotlight<number, fos.Sample>;
}) {
  const { init, deferred } = fos.useDeferrer();
  const fieldUpdater = useFieldUpdater(cache);

  useEffect(() => {
    deferred(() => {
      spotlight?.updateItems(fieldUpdater());
      cache.empty();
    });
  }, [cache, deferred, fieldUpdater, spotlight]);

  const colorUpdater = useColorUpdater(cache);

  useEffect(() => {
    deferred(
      debounce(
        () => {
          spotlight?.updateItems(colorUpdater());
          cache.empty();
        },
        250,
        { trailing: true }
      )
    );
  }, [cache, deferred, colorUpdater, spotlight]);

  useEffect(() => {
    return spotlight ? init() : undefined;
  }, [spotlight, init]);
}

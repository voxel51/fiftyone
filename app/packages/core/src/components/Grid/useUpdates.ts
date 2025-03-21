import { Coloring, ImaVidLooker, VideoLooker } from "@fiftyone/looker";
import { Colorscale } from "@fiftyone/looker/src/state";
import { RENDER_STATUS_PENDING } from "@fiftyone/looker/src/worker/shared";
import type Spotlight from "@fiftyone/spotlight";
import type { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilValue } from "recoil";
import { useDetectNewActiveLabelFields } from "../Sidebar/useDetectNewActiveLabelFields";
import type { LookerCache } from "./types";

export const getOverlays = (entry: fos.Lookers) => {
  // todo: there should be consistency here between video looker and other looker
  return entry instanceof VideoLooker
    ? entry.pluckedOverlays ?? []
    : entry.getSampleOverlays() ?? [];
};

export const markTheseOverlaysAsPending = (
  overlays: ReturnType<typeof getOverlays>
) => {
  for (const overlay of overlays) {
    markOverlayAsPending(overlay);
  }
};

const markOverlayAsPending = (
  overlay: ReturnType<typeof getOverlays>[number]
) => {
  if (overlay.label) {
    overlay.label = {
      ...overlay.label,
      _renderStatus: RENDER_STATUS_PENDING,
    };
  }
};

export const handleNetNewOverlays = (
  entry: fos.Lookers,
  newFields: string[]
) => {
  if (entry instanceof ImaVidLooker) {
    entry.refreshSample(newFields, entry.frameNumber);
  } else {
    entry.refreshSample(newFields);
  }
};

export const handlePotentiallyStillPendingOverlays = (entry: fos.Lookers) => {
  const overlays = entry.getSampleOverlays() ?? [];
  const rerender: string[] = [];

  for (const overlay of overlays) {
    if (!overlay.field) {
      continue;
    }

    if (overlay?.label?._renderStatus !== RENDER_STATUS_PENDING) {
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
  const { getNewFields, removeField } = useDetectNewActiveLabelFields({
    modal: false,
  });
  const selected = useRecoilValue(fos.selectedSamples);

  return useCallback(
    (fontSize: number, lastColoringKey: string | null) => {
      return (id: ID) => {
        const entry = cache.get(id.description);
        if (!entry) {
          return;
        }

        const thisColoringKey = getColoringKey(
          options.coloring,
          options.colorscale
        );

        if (lastColoringKey !== thisColoringKey) {
          removeField(id.description);
        }

        const newFields = getNewFields(id.description) ?? [];
        const shouldHardReload = Boolean(newFields?.length);

        if (shouldHardReload) {
          const overlays = getOverlays(entry);
          const newOverlays = overlays.filter(
            (o) =>
              o.field &&
              (o.label?.mask_path?.length > 0 ||
                o.label?.map_path?.length > 0 ||
                o.label?.mask ||
                o.label?.map) &&
              newFields.includes(o.field)
          );

          if (newOverlays?.length) {
            markTheseOverlaysAsPending(newOverlays);
          }
        }

        // we want to update looker settings, since async manager refs them
        // todo: decouple async manager from looker state and pass options in
        // handleNewOverlays / refreshSample
        entry.updateOptions(
          {
            ...options,
            fontSize,
            selected: selected.has(id.description),
          },
          shouldHardReload
        );

        if (shouldHardReload) {
          handleNetNewOverlays(entry, newFields ?? []);
        } else {
          handlePotentiallyStillPendingOverlays(entry);
        }

        entry.updateOptions({}, shouldHardReload);
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

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const lastColoringKeyRef = useRef(
    getColoringKey(options.coloring, options.colorscale)
  );

  useEffect(() => {
    deferred(() => {
      spotlight?.updateItems(
        itemUpdater(getFontSize(), lastColoringKeyRef.current)
      );
      lastColoringKeyRef.current = getColoringKey(
        optionsRef.current.coloring,
        optionsRef.current.colorscale
      );
      cache.empty();
    });
  }, [cache, deferred, getFontSize, itemUpdater, spotlight]);

  useEffect(() => {
    return spotlight ? init() : undefined;
  }, [spotlight, init]);
}

export const getColoringKey = (
  coloring: Coloring | undefined,
  colorscale: Colorscale | undefined,
  suffix?: string
) => {
  if (!coloring) {
    return null;
  }

  return `${coloring?.seed}-${coloring?.by}-${coloring.scale.length}-${coloring.pool.length}-${colorscale?.fields.length}-${colorscale?.default.name}-${suffix}`;
};

import type Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import { useShouldReloadSampleOnActiveFieldsChange } from "../Sidebar/useShouldReloadSample";
import { LookerCache } from "./types";

export default function useUpdates(
  cache: LookerCache,
  getFontSize: () => number,
  options: ReturnType<typeof fos.useLookerOptions>,
  spotlight?: Spotlight<number, fos.Sample>
) {
  const { init, deferred } = fos.useDeferrer();

  const getNewFields = useShouldReloadSampleOnActiveFieldsChange({
    modal: false,
  });

  const selected = useRecoilValue(fos.selectedSamples);
  useEffect(() => {
    deferred(() => {
      const fontSize = getFontSize();
      spotlight?.updateItems((id) => {
        const entry = cache.get(id.description);
        if (!entry) {
          return;
        }

        entry.updateOptions({
          ...options,
          fontSize,
          selected: selected.has(id.description),
        });

        const newFieldsIfAny = getNewFields(id.description);

        const overlays = entry.getSampleOverlays() ?? [];

        // rerender looker if active fields have changed and have never been rendered before
        if (newFieldsIfAny) {
          const thisInstanceOverlays = overlays.filter(
            (o) => o.field && newFieldsIfAny.includes(o.field)
          );

          thisInstanceOverlays?.forEach((o) => {
            if (o.label) {
              // "pending" means we're marking this label for rendering / painting
              // even if it's interrupted, say by unchecking sidebar
              o.label.renderStatus = "pending";
            }
          });

          if (thisInstanceOverlays?.length > 0) {
            entry.refreshSample(newFieldsIfAny);
          }
        } else {
          // if there're any labels marked "pending", render them
          const pending = overlays.filter(
            (o) => o.field && o.label && o.label.renderStatus === "pending"
          );

          if (pending?.length > 0) {
            const rerenderFields = pending.map((o) => o.field!);
            entry.refreshSample(rerenderFields);
          }
        }
      });

      cache.empty();
    });
  }, [
    cache,
    deferred,
    getFontSize,
    getNewFields,
    options,
    selected,
    spotlight,
  ]);

  useEffect(() => {
    return spotlight ? init() : undefined;
  }, [spotlight, init]);

  return;
}

import type Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import type { LRUCache } from "lru-cache";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import { useShouldReloadSampleOnActiveFieldsChange } from "../Sidebar/useShouldReloadSample";

export default function useSelect(
  getFontSize: () => number,
  options: ReturnType<typeof fos.useLookerOptions>,
  store: LRUCache<string, fos.Lookers>,
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
      const retained = new Set<string>();
      spotlight?.updateItems((id) => {
        const instance = store.get(id.description);
        if (!instance) {
          return;
        }

        retained.add(id.description);
        instance.updateOptions({
          ...options,
          fontSize,
          selected: selected.has(id.description),
        });

        const newFieldsIfAny = getNewFields(id.description);

        const overlays = instance.getSampleOverlays() ?? [];

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
            instance.refreshSample(newFieldsIfAny);
          }
        } else {
          // if there're any labels marked "pending", render them
          const pending = overlays.filter(
            (o) => o.field && o.label && o.label.renderStatus === "pending"
          );

          if (pending?.length > 0) {
            const rerenderFields = pending.map((o) => o.field!);
            instance.refreshSample(rerenderFields);
          }
        }
      });

      for (const id of store.keys()) {
        if (retained.has(id)) continue;
        store.delete(id);
      }
    });
  }, [deferred, getFontSize, options, selected, spotlight, store]);

  useEffect(() => {
    return spotlight ? init() : undefined;
  }, [spotlight, init]);

  return;
}

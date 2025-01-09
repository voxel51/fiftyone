import type Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import type { LRUCache } from "lru-cache";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";

export default function useSelect(
  getFontSize: () => number,
  options: ReturnType<typeof fos.useLookerOptions>,
  store: LRUCache<string, fos.Lookers>,
  spotlight?: Spotlight<number, fos.Sample>
) {
  const { init, deferred } = fos.useDeferrer();

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

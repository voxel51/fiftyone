import type Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import type useRefreshers from "./useRefreshers";

export default function useSelect(
  getFontSize: () => number,
  options: ReturnType<typeof fos.useLookerOptions>,
  store: ReturnType<typeof useRefreshers>["lookerCache"],
  spotlight?: Spotlight<number, fos.Sample>
) {
  const { init, deferred } = fos.useDeferrer();

  const selected = useRecoilValue(fos.selectedSamples);
  useEffect(() => {
    deferred(() => {
      const fontSize = getFontSize();
      spotlight?.updateItems((id) => {
        const entry = store.get(id.description);
        if (!entry) {
          return;
        }

        entry.instance.updateOptions({
          ...options,
          fontSize,
          selected: selected.has(id.description),
        });
      });

      for (const id of store.hidden()) {
        store.remove(id);
      }
    });
  }, [deferred, getFontSize, options, selected, spotlight, store]);

  useEffect(() => {
    return spotlight ? init() : undefined;
  }, [spotlight, init]);

  return;
}

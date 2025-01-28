import type Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import type { LookerCache } from "./types";

export default function useSelect(
  cache: LookerCache,
  getFontSize: () => number,
  options: ReturnType<typeof fos.useLookerOptions>,
  spotlight?: Spotlight<number, fos.Sample>
) {
  const { init, deferred } = fos.useDeferrer();

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
      });

      cache.empty();
    });
  }, [cache, deferred, getFontSize, options, selected, spotlight]);

  useEffect(() => {
    return spotlight ? init() : undefined;
  }, [spotlight, init]);

  return;
}

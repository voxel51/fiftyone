import type Spotlight from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import { useShouldReloadSampleOnActiveFieldsChange } from "../Sidebar/useShouldReloadSample";
import type { LookerCache } from "./types";

export default function useUpdates(
  cache: LookerCache,
  getFontSize: () => number,
  options: ReturnType<typeof fos.useLookerOptions>,
  spotlight?: Spotlight<number, fos.Sample>
) {
  const { init, deferred } = fos.useDeferrer();

  const shouldRefresh = useShouldReloadSampleOnActiveFieldsChange({
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

        // rerender looker if active fields have changed and have never been
        // rendered before
        if (shouldRefresh(id.description)) {
          entry.refreshSample();
        }
      });

      cache.empty();
    });
  }, [
    cache,
    deferred,
    getFontSize,
    options,
    selected,
    shouldRefresh,
    spotlight,
  ]);

  useEffect(() => {
    return spotlight ? init() : undefined;
  }, [spotlight, init]);

  return;
}

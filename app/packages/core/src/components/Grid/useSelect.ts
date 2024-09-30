import type Spotlight from "@fiftyone/spotlight";
import type { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";

export default function useSelect(
  getFontSize: () => number,
  options: ReturnType<typeof fos.useLookerOptions>,
  store: WeakMap<ID, fos.Lookers>,
  spotlight?: Spotlight<number, fos.Sample>
) {
  const { init, deferred } = fos.useDeferrer();

  const selected = useRecoilValue(fos.selectedSamples);
  useEffect(() => {
    deferred(() => {
      const fontSize = getFontSize();
      spotlight?.updateItems((id) => {
        store.get(id)?.updateOptions({
          ...options,
          fontSize,
          selected: selected.has(id.description),
        });
      });
    });
  }, [deferred, getFontSize, options, selected, spotlight, store]);

  useEffect(() => {
    return spotlight ? init() : undefined;
  }, [spotlight, init]);

  return;
}

import type Spotlight from "@fiftyone/spotlight";
import { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";

export default function useSelect(
  options: ReturnType<typeof fos.useLookerOptions>,
  store: WeakMap<ID, fos.Lookers>,
  spotlight?: Spotlight<number, fos.Sample>
) {
  const { init, deferred } = fos.useDeferrer();

  const selected = useRecoilValue(fos.selectedSamples);
  useEffect(() => {
    deferred(() => {
      spotlight?.updateItems((id) => {
        store.get(id)?.updateOptions({
          ...options,
          selected: selected.has(id.description),
        });
      });
    });
  }, [deferred, options, selected, spotlight, store]);

  useEffect(() => {
    return spotlight ? init() : undefined;
  }, [spotlight, init]);

  return;
}

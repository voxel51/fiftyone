import { FlashlightConfig } from "@fiftyone/flashlight";
import * as fos from "@fiftyone/state";
import { get as getPath } from "lodash";
import { useRecoilTransaction_UNSTABLE, useRecoilValue } from "recoil";

export default <T extends fos.Lookers>(store: fos.LookerStore<T>) => {
  const groupField = useRecoilValue(fos.groupField);

  return useRecoilTransaction_UNSTABLE<
    Parameters<NonNullable<FlashlightConfig<number>["onItemClick"]>>
  >(
    ({ get, set }) =>
      (_, id, __) => {
        const current = get(fos.currentModalSample);
        if (current === null) {
          throw new Error("modal sample not defined");
        }

        set(fos.currentModalSample, { index: current.index, id });
        const sample = store.samples.get(id);

        if (!sample) {
          throw new Error("sample not found");
        }

        set(
          fos.groupSlice(true),
          getPath(sample.sample, groupField).name as string
        );
      },
    [groupField]
  );
};

import * as fos from "@fiftyone/state";
import { get as getPath } from "lodash";
import { useRecoilCallback } from "recoil";

export default <T extends fos.Lookers>(store: fos.LookerStore<T>) => {
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (_, id: string, __) => {
        const current = await snapshot.getPromise(fos.currentModalSample);

        if (current === null) {
          throw new Error("modal sample not defined");
        }
        const groupField = await snapshot.getPromise(fos.groupField);

        const sample = store.samples.get(id);

        if (!sample) {
          throw new Error("sample not found");
        }

        set(
          fos.modalGroupSlice,
          getPath(sample.sample, groupField).name as string
        );
      },
    []
  );
};

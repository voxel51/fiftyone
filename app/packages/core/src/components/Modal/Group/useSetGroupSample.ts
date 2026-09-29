import * as fos from "@fiftyone/state";
import { get as getPath } from "lodash";
import { useReverbCallback } from "@fiftyone/reverb";

export default <T extends fos.Lookers>(store: fos.LookerStore<T>) => {
  return useReverbCallback(
    ({ set, snapshot }) =>
      async (_, id: string, __) => {
        const current = await snapshot.getPromise(fos.modalSelector);

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
          getPath(sample.sample, groupField).name as string,
        );
      },
    [],
  );
};

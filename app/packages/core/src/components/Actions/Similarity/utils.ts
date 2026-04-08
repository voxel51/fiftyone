import type { Method } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { selectedLabels } from "@fiftyone/state";
import type { Snapshot } from "recoil";
import { selectorFamily } from "recoil";

export const getQueryIds = async (
  snapshot: Snapshot,
  brainKey?: string
): Promise<string[] | string | undefined> => {
  const selectedLabelIds = await snapshot.getPromise(fos.selectedLabelIds);
  const selectedLabels = await snapshot.getPromise(fos.selectedLabels);

  if (selectedLabelIds.size) {
    const methods = await snapshot.getPromise(fos.similarityMethods);
    const labels_field = methods.patches
      .filter(([method]) => method.key === brainKey)
      .map(([_, value]) => value)[0];
    return [...selectedLabelIds].filter(
      (id) => selectedLabels[id].field === labels_field
    );
  }

  const selectedSamples = Array.from(
    (await snapshot.getPromise(fos.selectedSamples)).keys()
  );

  if (selectedSamples.length) {
    return [...selectedSamples];
  }

  return await snapshot.getPromise(fos.modalSampleId);
};

export const availableSimilarityKeys = selectorFamily<
  string[],
  { modal: boolean; isImageSearch: boolean }
>({
  key: "availableSimilarityKeys",
  get:
    (params) =>
    ({ get }) => {
      if (
        get(fos.isPatchesView) ||
        (params.modal && get(fos.hasSelectedLabels))
      ) {
        return get(availablePatchesSimilarityKeys(params)).map(
          ({ key }) => key
        );
      }

      const { samples: methods } = get(fos.similarityMethods);

      if (params.isImageSearch) {
        return methods.map(({ key }) => key).sort();
      }

      return methods
        .filter((method) => method.supportsPrompts === true)
        .map(({ key }) => key)
        .sort();
    },
});

const availablePatchesSimilarityKeys = selectorFamily<
  Method[],
  {
    modal: boolean;
    isImageSearch: boolean;
  }
>({
  key: "availablePatchesSimilarityKeys",
  get:
    (params) =>
    ({ get }) => {
      let patches: [Method, string][] = [];
      let { patches: methods } = get(fos.similarityMethods);
      if (!params.isImageSearch) {
        methods = methods.filter(([method]) => method.supportsPrompts === true);
      }
      patches = methods.map(([method, field]) => [method, field]);

      if (params.modal) {
        if (get(fos.hasSelectedLabels)) {
          const fields = new Set(
            Object.values(get(selectedLabels)).map(({ field }) => field)
          );

          return patches
            .filter(([_, field]) => fields.has(field))
            .map(([key]) => key);
        }
        const { sample } = get(fos.modalSample);

        return patches.filter(([_, v]) => sample[v]).map(([key]) => key);
      }

      return patches
        .filter(([_, field]) =>
          get(fos.labelPaths({ expanded: false })).includes(field)
        )
        .map(([key]) => key);
    },
});

export const sortType = selectorFamily<string, boolean>({
  key: "sortBySimilarityType",
  get:
    (modal) =>
    ({ get }) => {
      const isRoot = get(fos.isRootView);

      if (modal) {
        return "labels";
      }

      if (isRoot) {
        return "images";
      }

      return "patches";
    },
});

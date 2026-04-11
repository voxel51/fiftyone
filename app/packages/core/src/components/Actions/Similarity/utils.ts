import type { Method } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { selectedLabels } from "@fiftyone/state";
import type { Snapshot } from "recoil";
import { selectorFamily } from "recoil";

export type QueryIds = {
  queryIds: string[] | string | undefined;
  negativeQueryIds?: string[];
};

export const getQueryIds = async (
  snapshot: Snapshot,
  brainKey?: string
): Promise<QueryIds> => {
  const isModal = await snapshot.getPromise(fos.isModalActive);

  // In modal: check selected labels for patch-based similarity
  if (isModal) {
    const selectedLabelIds = await snapshot.getPromise(fos.selectedLabelIds);
    const selectedLabelMap = await snapshot.getPromise(fos.selectedLabelMap);

    if (selectedLabelIds.size) {
      const methods = await snapshot.getPromise(fos.similarityMethods);
      const labels_field = methods.patches
        .filter(([method]) => method.key === brainKey)
        .map(([_, value]) => value)[0];

      const matching = [...selectedLabelIds].filter(
        (id) => selectedLabelMap[id]?.field === labels_field
      );

      // Separate positive (default) and negative (alt) labels
      const positive = matching.filter(
        (id) => selectedLabelMap[id]?.type !== "alt"
      );
      const negative = matching.filter(
        (id) => selectedLabelMap[id]?.type === "alt"
      );

      return {
        queryIds: positive.length > 0 ? positive : undefined,
        negativeQueryIds: negative.length > 0 ? negative : undefined,
      };
    }

    return { queryIds: await snapshot.getPromise(fos.modalSampleId) };
  }

  // Grid: use selected samples
  const selectedSamplesMap = await snapshot.getPromise(fos.selectedSamples);
  const positive: string[] = [];
  const negative: string[] = [];

  for (const [id, type] of selectedSamplesMap.entries()) {
    if (type === "alt") {
      negative.push(id);
    } else {
      positive.push(id);
    }
  }

  if (positive.length > 0 || negative.length > 0) {
    return {
      queryIds: positive.length > 0 ? positive : undefined,
      negativeQueryIds: negative.length > 0 ? negative : undefined,
    };
  }

  return { queryIds: undefined };
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

export function buildRunName({
  isImageSearch,
  textQuery,
  queryIds,
  negativeQueryIds,
  patchesField,
}: {
  isImageSearch: boolean;
  textQuery: string;
  queryIds: string[] | string | undefined;
  negativeQueryIds?: string[];
  patchesField?: string;
}): string {
  if (!isImageSearch) {
    return textQuery.trim();
  }

  const count = Array.isArray(queryIds) ? queryIds.length : 1;
  const negCount = negativeQueryIds?.length ?? 0;
  const unit = patchesField ? "patch" : "sample";
  const pluralize = (n: number, u: string) =>
    `${n} ${n === 1 ? u : u + (u === "patch" ? "es" : "s")}`;

  if (negCount > 0) {
    return `${pluralize(count, unit)} positive, ${pluralize(
      negCount,
      unit
    )} negative`;
  }

  return pluralize(count, unit);
}

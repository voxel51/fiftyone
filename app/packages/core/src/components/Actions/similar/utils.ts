import {
  ModalSample,
  selectedLabels,
  useUnprocessedStateUpdate,
} from "@fiftyone/state";
import { useErrorHandler } from "react-error-boundary";
import { selectorFamily, Snapshot, useRecoilCallback } from "recoil";
import { searchBrainKeyValue } from "./Similar";
import * as fos from "@fiftyone/state";
import { getFetchFunction, toSnakeCase } from "@fiftyone/utilities";

export const getQueryIds = async (
  snapshot: Snapshot,
  brainKey?: string
): Promise<string[] | string | undefined> => {
  const selectedLabelIds = await snapshot.getPromise(fos.selectedLabelIds);
  const selectedLabels = await snapshot.getPromise(fos.selectedLabels);
  const methods = await snapshot.getPromise(fos.similarityMethods);

  if (selectedLabelIds.size) {
    return [...selectedLabelIds].filter(
      (id) => selectedLabels[id].field === labels_field
    );
  }

  const labels_field = methods.patches
    .filter(([method]) => method.key === brainKey)
    .map(([_, value]) => value)[0];

  const selectedSamples = await snapshot.getPromise(fos.selectedSamples);
  const isPatches = await snapshot.getPromise(fos.isPatchesView);
  const modal = await snapshot.getPromise(fos.modal);

  if (isPatches) {
    if (selectedSamples.size) {
      return [...selectedSamples].map((id) => {
        const sample = fos.getSample(id);
        if (sample) {
          return sample.sample[labels_field]._id;
        }

        throw new Error("sample not found");
      });
    }

    return modal?.sample[labels_field]._id;
  }

  if (selectedSamples.size) {
    return [...selectedSamples];
  }

  return modal?.sample._id;
};

export const useSortBySimilarity = (close) => {
  const update = useUnprocessedStateUpdate();
  const handleError = useErrorHandler();

  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (parameters: fos.State.SortBySimilarityParameters) => {
        set(fos.similaritySorting, true);

        const queryIds = parameters.query
          ? null
          : await getQueryIds(snapshot, parameters.brainKey);
        const view = await snapshot.getPromise(fos.view);
        const subscription = await snapshot.getPromise(fos.stateSubscription);

        const { query, ...commonParams } = parameters;

        const combinedParameters = {
          ...commonParams,
        };

        combinedParameters["query"] = query ?? queryIds;

        try {
          const data: fos.StateUpdate = await getFetchFunction()(
            "POST",
            "/sort",
            {
              dataset: await snapshot.getPromise(fos.datasetName),
              view,
              subscription,
              filters: await snapshot.getPromise(fos.filters),
              extended: toSnakeCase(combinedParameters),
            }
          );

          update(({ set }) => {
            set(fos.similarityParameters, combinedParameters);
            set(fos.modal, null);
            set(fos.similaritySorting, false);
            set(fos.savedLookerOptions, (cur) => ({ ...cur, showJSON: false }));
            set(fos.selectedLabels, {});
            set(fos.hiddenLabels, {});
            set(fos.modal, null);
            close();

            return data;
          });
        } catch (error) {
          handleError(error);
        }
      },
    []
  );
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
        return get(availablePatchesSimilarityKeys(params));
      }

      const { samples: methods } = get(fos.similarityMethods);

      if (params.isImageSearch) {
        return methods.map(({ key }) => key);
      }

      return methods
        .filter((method) => method.supportsPrompts === true)
        .map(({ key }) => key);
    },
});

const availablePatchesSimilarityKeys = selectorFamily<
  string[],
  {
    modal: boolean;
    isImageSearch: boolean;
  }
>({
  key: "availablePatchesSimilarityKeys",
  get:
    (params) =>
    ({ get }) => {
      let patches: [string, string][] = [];
      let { patches: methods } = get(fos.similarityMethods);
      if (!params.isImageSearch) {
        methods = methods.filter(([method]) => method.supportsPrompts === true);
      }
      patches = methods.map(([{ key }, field]) => [key, field]);

      if (params.modal) {
        if (get(fos.hasSelectedLabels)) {
          const fields = new Set(
            Object.values(get(selectedLabels)).map(({ field }) => field)
          );

          return patches
            .filter(([_, field]) => fields.has(field))
            .map(([key]) => key);
        } else {
          const { sample } = get(fos.modal) as ModalSample;

          return patches.filter(([_, v]) => sample[v]).map(([key]) => key);
        }
      }

      return patches
        .filter(([_, field]) => get(fos.labelPaths({})).includes(field))
        .map(([key]) => key);
    },
});

export const currentSimilarityKeys = selectorFamily<
  { total: number; choices: string[] },
  { modal: boolean; isImageSearch: boolean }
>({
  key: "currentSimilarityKeys",
  get:
    ({ modal, isImageSearch }) =>
    ({ get }) => {
      const searchBrainKey = get(searchBrainKeyValue);
      const keys = get(availableSimilarityKeys({ modal, isImageSearch }));
      const result = keys.filter((k) => k.includes(searchBrainKey)).sort();

      return {
        total: keys.length,
        choices: result.slice(0, 11),
      };
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

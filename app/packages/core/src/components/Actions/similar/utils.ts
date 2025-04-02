import type { Method } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import { selectedLabels, useBrowserStorage } from "@fiftyone/state";
import { getFetchFunction, toSnakeCase } from "@fiftyone/utilities";
import { useMemo } from "react";
import type { Snapshot } from "recoil";
import { selectorFamily, useRecoilCallback } from "recoil";

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
    await snapshot.getPromise(fos.selectedSamples)
  );

  if (selectedSamples.length) {
    return [...selectedSamples];
  }

  return await snapshot.getPromise(fos.modalSampleId);
};

export const useSortBySimilarity = (close) => {
  const [lastUsedBrainkeys, setLastUsedBrainKeys] =
    useBrowserStorage("lastUsedBrainKeys");
  const current = useMemo(() => {
    return lastUsedBrainkeys ? JSON.parse(lastUsedBrainkeys) : {};
  }, [lastUsedBrainkeys]);

  return useRecoilCallback(
    ({ snapshot, set }) =>
      async (parameters: fos.State.SortBySimilarityParameters) => {
        set(fos.similaritySorting, true);
        const dataset = await snapshot.getPromise(fos.dataset);
        if (!dataset) {
          throw new Error("dataset is not defined");
        }

        const queryIds = parameters.query
          ? null
          : await getQueryIds(snapshot, parameters.brainKey);

        const view = await snapshot.getPromise(fos.view);
        const subscription = await snapshot.getPromise(fos.stateSubscription);
        const slice = await snapshot.getPromise(fos.sessionGroupSlice);

        const { query, ...commonParams } = parameters;

        const combinedParameters = {
          ...commonParams,
        };

        combinedParameters["query"] = query ?? queryIds;
        const filters = await snapshot.getPromise(fos.filters);

        // save the brainkey into local storage
        setLastUsedBrainKeys(
          JSON.stringify({
            ...current,
            [dataset.datasetId]: combinedParameters.brainKey,
          })
        );
        await getFetchFunction()("POST", "/sort", {
          dataset: dataset.name,
          view,
          subscription,
          filters,
          extended: toSnakeCase(combinedParameters),
          slice,
        });
        set(fos.similarityParameters, combinedParameters);
        close();
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
        } else {
          const { sample } = get(fos.modalSample);

          return patches.filter(([_, v]) => sample[v]).map(([key]) => key);
        }
      }

      return patches
        .filter(([_, field]) =>
          get(fos.labelPaths({ expanded: false })).includes(field)
        )
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
      const keys = get(availableSimilarityKeys({ modal, isImageSearch }));
      return {
        total: keys.length,
        choices: keys,
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

export const currentBrainConfig = selectorFamily<Method | undefined, string>({
  key: "currenBrainConfig",
  get:
    (key) =>
    ({ get }) => {
      if (get(fos.isPatchesView)) {
        const { patches: patches } = get(fos.similarityMethods);
        const patch = patches.find(([method, _]) => method.key === key);
        if (patch) {
          return patch[0];
        }
      }

      const { samples: methods } = get(fos.similarityMethods);
      return methods.find((method) => method.key === key);
    },
});

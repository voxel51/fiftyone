import { useUnprocessedStateUpdate } from "@fiftyone/state";
import { useErrorHandler } from "react-error-boundary";
import { selectorFamily, Snapshot, useRecoilCallback } from "recoil";
import { searchBrainKeyValue } from "./Similar";
import * as fos from "@fiftyone/state";
import { getFetchFunction, toSnakeCase } from "@fiftyone/utilities";

export const getQueryIds = async (snapshot: Snapshot, brainKey?: string) => {
  const selectedLabelIds = await snapshot.getPromise(fos.selectedLabelIds);
  const selectedLabels = await snapshot.getPromise(fos.selectedLabels);
  const methods = await snapshot.getPromise(fos.similarityMethods);

  const labels_field = methods.patches
    .filter(([m, v]) => m.key === brainKey)
    .map(([m, v]) => v)[0];
  if (selectedLabelIds.size) {
    return [...selectedLabelIds].filter(
      (id) => selectedLabels[id].field === labels_field
    );
  }
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

    return modal.sample[labels_field]._id;
  }

  if (selectedSamples.size) {
    return [...selectedSamples];
  }

  return modal.sample._id;
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
    ({ modal, isImageSearch }) =>
    ({ get }) => {
      const isPatches = get(fos.isPatchesView);
      let m = get(fos.similarityMethods);
      const keys: { patches: [string, string][]; samples: string[] } = {
        patches: [],
        samples: [],
      };
      if (!isImageSearch) {
        keys.patches = m.patches
          .filter(([m, f]) => m.supportsPrompts === true)
          .map(([m, f]) => [m.key, f]);
        keys.samples = m.samples
          .filter((m) => m.supportsPrompts === true)
          .map((m) => m.key);
      } else {
        keys.patches = m.patches.map(([m, f]) => [m.key, f]);
        keys.samples = m.samples.map((m) => m.key);
      }

      if (!isPatches && !modal) {
        return keys.samples;
      } else if (!modal) {
        return keys.patches.reduce((acc, [key, field]) => {
          if (get(fos.labelPaths({})).includes(field)) {
            acc = [...acc, key];
          }
          return acc;
        }, []);
      } else if (modal) {
        const selectedLabels = get(fos.selectedLabels);

        if (Object.keys(selectedLabels).length) {
          const fields = new Set(
            Object.values(selectedLabels).map(({ field }) => field)
          );

          const patches = keys.patches
            .filter(([k, v]) => fields.has(v))
            .reduce((acc, [k]) => {
              return [...acc, k];
            }, []);
          return patches;
        } else if (isPatches) {
          const { sample } = get(fos.modal);

          return keys.patches
            .filter(([k, v]) => sample[v])
            .reduce((acc, [k]) => {
              return [...acc, k];
            }, []);
        }

        return keys.samples;
      }
      return [];
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
      } else if (isRoot) {
        return "images";
      } else {
        return "patches";
      }
    },
});

import * as fos from "@fiftyone/state";
import {
  Method,
  selectedLabels,
  useBrowserStorage,
  useUnprocessedStateUpdate,
} from "@fiftyone/state";
import { getFetchFunction, toSnakeCase } from "@fiftyone/utilities";
import { useMemo } from "react";
import { useErrorHandler } from "react-error-boundary";
import {
  Snapshot,
  selectorFamily,
  useRecoilCallback,
  useRecoilValue,
} from "recoil";

export const getQueryIds = async (
  snapshot: Snapshot,
  brainKey?: string
): Promise<string[] | string | undefined> => {
  const selectedLabelIds = await snapshot.getPromise(fos.selectedLabelIds);
  const selectedLabels = await snapshot.getPromise(fos.selectedLabels);
  const methods = await snapshot.getPromise(fos.similarityMethods);

  const labels_field = methods.patches
    .filter(([method]) => method.key === brainKey)
    .map(([_, value]) => value)[0];

  if (selectedLabelIds.size) {
    return [...selectedLabelIds].filter(
      (id) => selectedLabels[id].field === labels_field
    );
  }

  const selectedSamples = await snapshot.getPromise(fos.selectedSamples);
  const isPatches = await snapshot.getPromise(fos.isPatchesView);

  if (isPatches) {
    if (selectedSamples.size) {
      return [...selectedSamples].map((id) => {
        const sample = fos.getSample(id);
        if (sample) {
          return sample.sample[labels_field]._id as string;
        }

        throw new Error("sample not found");
      });
    }

    return (await snapshot.getPromise(fos.modalSample)).sample[labels_field]
      ._id as string;
  }

  if (selectedSamples.size) {
    return [...selectedSamples];
  }

  return await snapshot.getPromise(fos.modalSampleId);
};

export const useSortBySimilarity = (close) => {
  const update = useUnprocessedStateUpdate(true);
  const handleError = useErrorHandler();
  const datasetId = useRecoilValue(fos.dataset).id;
  const [lastUsedBrainkeys, setLastUsedBrainKeys] =
    useBrowserStorage("lastUsedBrainKeys");
  const current = useMemo(() => {
    return lastUsedBrainkeys ? JSON.parse(lastUsedBrainkeys) : {};
  }, [lastUsedBrainkeys]);

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

        // save the brainkey into local storage
        setLastUsedBrainKeys(
          JSON.stringify({
            ...current,
            [datasetId]: combinedParameters.brainKey,
          })
        );

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

          update(({ reset, set }) => {
            set(fos.similarityParameters, combinedParameters);
            reset(fos.currentModalSample);
            set(fos.similaritySorting, false);
            set(fos.savedLookerOptions, (cur) => ({ ...cur, showJSON: false }));
            set(fos.hiddenLabels, {});
            reset(fos.selectedLabels);
            reset(fos.selectedSamples);
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

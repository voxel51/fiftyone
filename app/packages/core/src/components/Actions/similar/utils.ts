import * as fos from "@fiftyone/state";
import {
  collapseFields,
  Method,
  ModalSample,
  selectedLabels,
  transformDataset,
  useBrowserStorage,
} from "@fiftyone/state";
import {
  getFetchFunction,
  toCamelCase,
  toSnakeCase,
} from "@fiftyone/utilities";
import { useMemo } from "react";
import {
  selectorFamily,
  Snapshot,
  useRecoilCallback,
  useRecoilTransaction_UNSTABLE,
  useSetRecoilState,
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
  const [lastUsedBrainkeys, setLastUsedBrainKeys] =
    useBrowserStorage("lastUsedBrainKeys");
  const setSorting = useSetRecoilState(fos.similaritySorting);
  const current = useMemo(() => {
    return lastUsedBrainkeys ? JSON.parse(lastUsedBrainkeys) : {};
  }, [lastUsedBrainkeys]);
  const setSortingState = useRecoilTransaction_UNSTABLE(
    ({ set, reset }) =>
      (
        combinedParameters: fos.State.SortBySimilarityParameters,
        sampleFields,
        frameFields
      ) => {
        set(fos.similarityParameters, combinedParameters);
        set(fos.modal, null);
        set(fos.similaritySorting, false);
        set(fos.savedLookerOptions, (cur) => ({ ...cur, showJSON: false }));
        set(fos.hiddenLabels, {});
        set(fos.modal, null);
        reset(fos.selectedLabels);
        reset(fos.selectedSamples);
        set(fos.sampleFields, sampleFields);
        set(fos.frameFields, frameFields);
        close();
      },
    [close]
  );

  return useRecoilCallback(
    ({ snapshot }) =>
      async (parameters: fos.State.SortBySimilarityParameters) => {
        setSorting(true);
        const dataset = await snapshot.getPromise(fos.dataset);
        if (!dataset) {
          throw new Error("dataset is not defined");
        }

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
        const filters = await snapshot.getPromise(fos.filters);

        // save the brainkey into local storage
        setLastUsedBrainKeys(
          JSON.stringify({
            ...current,
            [dataset.id]: combinedParameters.brainKey,
          })
        );
        let { dataset: data } = await getFetchFunction()("POST", "/sort", {
          dataset: dataset.name,
          view,
          subscription,
          filters,
          extended: toSnakeCase(combinedParameters),
        });
        data = transformDataset(toCamelCase(data));

        setSortingState(
          combinedParameters,
          collapseFields(data.sampleFields),
          collapseFields(data.frameFields)
        );
      },
    [setSorting, setSortingState]
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
          const { sample } = get(fos.modal) as ModalSample;

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

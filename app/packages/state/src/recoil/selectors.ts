import { isRgbMaskTargets } from "@fiftyone/looker/src/overlays/util";
import { KeypointSkeleton } from "@fiftyone/looker/src/state";
import {
  datasetAppConfigFragment,
  datasetAppConfigFragment$data,
  datasetAppConfigFragment$key,
  datasetFragment,
  datasetFragment$key,
  graphQLSyncFragmentAtom,
} from "@fiftyone/relay";
import { currentSlice, fieldVisibilityStage, isGroup } from "@fiftyone/state";
import { toSnakeCase } from "@fiftyone/utilities";
import { DefaultValue, atomFamily, selector, selectorFamily } from "recoil";
import { v4 as uuid } from "uuid";
import * as atoms from "./atoms";
import { config } from "./config";
import { dataset as datasetAtom } from "./dataset";
import { isModalActive, modalSample, modalSelector } from "./modal";
import { pathFilter } from "./pathFilters";
import { State } from "./types";
import { isPatchesView } from "./view";

export const datasetName = graphQLSyncFragmentAtom<
  datasetFragment$key,
  string | null
>(
  {
    fragments: [datasetFragment],
    keys: ["dataset"],
    read: (dataset) => {
      return dataset?.name || null;
    },
    default: null,
    selectorEffect: true,
  },
  {
    key: "datasetName",
  }
);

export const datasetId = graphQLSyncFragmentAtom<
  datasetFragment$key,
  string | null
>(
  {
    fragments: [datasetFragment],
    keys: ["dataset"],
    read: ({ datasetId }) => datasetId,
    default: null,
  },
  {
    key: "datasetId",
  }
);

export const isNotebook = selector<boolean>({
  key: "isNotebook",
  get: () => {
    const params = new URLSearchParams(window.location.search);

    return Boolean(params.get("notebook"));
  },
});

export const stateSubscription = selector<string>({
  key: "stateSubscription",
  get: () => {
    const params = new URLSearchParams(window.location.search);

    return params.get("subscription") || uuid();
  },
});

export const mediaTypeSelector = selector({
  key: "mediaTypeSelector",
  get: ({ get }) => get(datasetAtom)?.mediaType,
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const parentMediaTypeSelector = selector({
  key: "parentMediaTypeSelector",
  get: ({ get }) => get(datasetAtom)?.parentMediaType,
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const isVideoDataset = selector({
  key: "isVideoDataset",
  get: ({ get }) => get(atoms.mediaType) === "video",
});

export const is3DDataset = selector({
  key: "is3DDataset",
  get: ({ get }) => ["point_cloud", "three_d"].includes(get(atoms.mediaType)),
});

export const timeZone = selector<string>({
  key: "timeZone",
  get: ({ get }) => {
    return get(config)?.timezone || "UTC";
  },
});

export const appConfigDefault = selectorFamily<
  any,
  { key: string; modal: boolean }
>({
  key: "appConfigDefault",
  get:
    ({ modal, key }) =>
    ({ get }) => {
      if (modal) {
        return get(appConfigDefault({ modal: false, key }));
      }

      return get(config)[key];
    },
});

export const appConfigOption = atomFamily<any, { key: string; modal: boolean }>(
  {
    key: "appConfigOptions",
    default: appConfigDefault,
  }
);

export const datasetAppConfig = graphQLSyncFragmentAtom<
  datasetAppConfigFragment$key,
  datasetAppConfigFragment$data
>(
  {
    fragments: [datasetFragment, datasetAppConfigFragment],
    keys: ["dataset", "appConfig"],
    read: (data) => data,
    default: null,
  },
  {
    key: "datasetAppConfig",
  }
);

export const defaultVisibilityLabels =
  selector<State.DefaultVisibilityLabelsConfig>({
    key: "defaultVisibilityLabels",
    get: ({ get }) => {
      return get(datasetAppConfig)
        ?.defaultVisibilityLabels as State.DefaultVisibilityLabelsConfig | null;
    },
  });

export const disableFrameFiltering = selector<boolean>({
  key: "disableFrameFiltering",
  get: ({ get }) => {
    const datasetDisableFrameFiltering =
      get(datasetAppConfig)?.disableFrameFiltering;
    const globalDisableFrameFiltering = Boolean(
      get(appConfigOption({ modal: true, key: "disableFrameFiltering" }))
    );

    return datasetDisableFrameFiltering !== null
      ? datasetDisableFrameFiltering
      : globalDisableFrameFiltering;
  },
});

export const dynamicGroupsTargetFrameRate = selector<number>({
  key: "dynamicGroupsTargetFrameRate",
  get: ({ get }) => {
    return get(datasetAppConfig)?.dynamicGroupsTargetFrameRate ?? 30;
  },
});

export const defaultTargets = selector({
  key: "defaultTargets",
  get: ({ get }) => {
    return get(datasetAtom)?.defaultMaskTargets || {};
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const targets = selector({
  key: "targets",
  get: ({ get }) => {
    const defaults = get(datasetAtom)?.defaultMaskTargets || {};
    const labelTargets = get(datasetAtom)?.maskTargets || {};
    return {
      defaults,
      fields: labelTargets,
    };
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const getSkeleton = selector<(field: string) => KeypointSkeleton | null>(
  {
    key: "getSkeleton",
    get: ({ get }) => {
      const dataset = get(datasetAtom);

      const skeletons = dataset.skeletons.reduce((acc, { name, ...rest }) => {
        acc[name] = rest;
        return acc;
      }, {});

      return (field: string) => skeletons[field] || dataset.defaultSkeleton;
    },
  }
);

export const skeleton = selectorFamily<KeypointSkeleton | null, string>({
  key: "skeleton",
  get:
    (field) =>
    ({ get }) => {
      return get(getSkeleton)(field);
    },
});

export const getTarget = selector({
  key: "getTarget",
  get: ({ get }) => {
    const { defaults, fields } = get(targets);
    return (field, target) => {
      let maskTargets;
      if (field in fields) {
        maskTargets = fields[field];
      } else {
        maskTargets = defaults;
      }

      if (isRgbMaskTargets(maskTargets)) {
        const maskTargetTuple = Object.entries(maskTargets).find(
          ([_, el]) => el.intTarget === target
        );

        if (maskTargetTuple) {
          return maskTargetTuple[1].label;
        }
      }

      return maskTargets[target];
    };
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const selectedLabelMap = selector<State.SelectedLabelMap>({
  key: "selectedLabelMap",
  get: ({ get }) => {
    return get(atoms.selectedLabels).reduce(
      (acc, { labelId, ...label }) => ({
        [labelId]: label,
        ...acc,
      }),
      {}
    );
  },
  set: ({ set }, newValue) => {
    if (newValue instanceof DefaultValue) {
      newValue = {};
    }

    set(
      atoms.selectedLabels,
      Object.entries(newValue).map(([labelId, label]) => ({
        ...label,
        labelId,
      }))
    );
  },
});

export const selectedLabelIds = selector<Set<string>>({
  key: "selectedLabelIds",
  get: ({ get }) => {
    const labels = get(selectedLabelMap);
    return new Set(Object.keys(labels));
  },
});

export const anyTagging = selector<boolean>({
  key: "anyTagging",
  get: ({ get }) => {
    const values = [];
    [true, false].forEach((i) =>
      [true, false].forEach((j) => {
        values.push(get(atoms.tagging({ modal: i, labels: j })));
      })
    );
    return values.some((v) => v);
  },
  set: ({ set }, value) => {
    [true, false].forEach((i) =>
      [true, false].forEach((j) => {
        set(atoms.tagging({ modal: i, labels: j }), value);
      })
    );
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const hiddenLabelsArray = selector({
  key: "hiddenLabelsArray",
  get: ({ get }) => {
    return Object.entries(get(atoms.hiddenLabels)).map(([labelId, data]) => ({
      labelId,
      ...data,
    }));
  },
});

export const hiddenLabelIds = selector({
  key: "hiddenLabelIds",
  get: ({ get }) => {
    return new Set(Object.keys(get(atoms.hiddenLabels)));
  },
});

export const pathHiddenLabelsMap = selector<{
  [sampleId: string]: { [field: string]: string[] };
}>({
  key: "pathHiddenLabelsMap",
  get: ({ get }) => {
    const hidden = get(atoms.hiddenLabels);

    const result = {};

    Object.entries(hidden).forEach(([labelId, { sampleId, field }]) => {
      if (!result[sampleId]) {
        result[sampleId] = {};
      }

      if (!result[sampleId][field]) {
        result[sampleId][field] = [];
      }

      result[sampleId][field].push(labelId);
    });

    return result;
  },
  set: ({ get, set }, value) => {
    const labels = get(atoms.hiddenLabels);
    const newLabels: State.SelectedLabelMap = {};

    for (const sampleId in value) {
      for (const field in value[sampleId]) {
        for (let i = 0; i < value[sampleId][field].length; i++) {
          const labelId = value[sampleId][field][i];
          newLabels[labelId] = labels[labelId];
        }
      }
    }

    set(atoms.hiddenLabels, newLabels);
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const hiddenFieldLabels = selectorFamily<string[], string>({
  key: "hiddenFieldLabels",
  get:
    (fieldName) =>
    ({ get }) => {
      const labels = get(atoms.hiddenLabels);
      const {
        sample: { _id },
      } = get(modalSample);

      if (_id) {
        return Object.entries(labels)
          .filter(
            ([_, { sampleId: id, field }]) => _id === id && field === fieldName
          )
          .map(([labelId]) => labelId);
      }
      return [];
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export type Method = {
  key: string;
  supportsPrompts: boolean;
  maxK: number;
  supportsLeastSimilarity: boolean;
};

export const similarityMethods = selector<{
  patches: [Method, string][];
  samples: Method[];
}>({
  key: "similarityMethods",
  get: ({ get }) => {
    let methods = get(datasetAtom)?.brainMethods || [];
    const isGroupDataset = get(isGroup);
    const activeSlice = get(currentSlice(get(isModalActive)));

    if (isGroupDataset && activeSlice) {
      methods = methods.filter(({ viewStages }) => {
        return viewStages.some((vs) => {
          const { _cls, kwargs } = JSON.parse(vs);
          if (_cls === "fiftyone.core.stages.SelectGroupSlices") {
            const sliceValue = kwargs.filter(
              (kwarg: string[]) => kwarg[0] === "slices"
            )?.[0]?.[1];
            if (sliceValue && sliceValue !== activeSlice) return false;
          }
          return true;
        });
      });
    }

    return methods
      .filter(
        ({ config: { type, cls } }) =>
          type == "similarity" || cls.toLowerCase().includes("similarity")
      )
      .reduce(
        (
          { patches, samples },

          {
            config: {
              patchesField,
              supportsPrompts,
              supportsLeastSimilarity,
              maxK,
            },
            key,
          }
        ) => {
          if (patchesField) {
            patches.push([
              { key, supportsPrompts, supportsLeastSimilarity, maxK },
              patchesField,
            ]);
          } else {
            samples.push({
              key,
              supportsPrompts,
              supportsLeastSimilarity,
              maxK,
            });
          }
          return { patches, samples };
        },
        { patches: [], samples: [] }
      );
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const extendedStagesUnsorted = selector({
  key: "extendedStagesUnsorted",
  get: ({ get }) => {
    const sampleIds = get(atoms.extendedSelection)?.selection;
    const extendedSelectionOverrideStage = get(
      atoms.extendedSelectionOverrideStage
    );

    if (extendedSelectionOverrideStage) {
      return extendedSelectionOverrideStage;
    }
    return {
      "fiftyone.core.stages.Select":
        sampleIds && sampleIds.length
          ? { sample_ids: sampleIds, ordered: false }
          : undefined,
    };
  },
});

export const extendedStages = selector({
  key: "extendedStages",
  get: ({ get }) => {
    const similarity = get(atoms.similarityParameters);
    const fvStage = get(fieldVisibilityStage);
    const rest = fvStage?.cls
      ? {
          [fvStage.cls]: {
            field_names: fvStage.kwargs.field_names,
            _allow_missing: true,
          },
        }
      : {};

    return {
      ...get(extendedStagesUnsorted),
      "fiftyone.core.stages.SortBySimilarity": similarity
        ? toSnakeCase(similarity)
        : undefined,
      ...rest,
    };
  },
});

export const selectedPatchIds = selectorFamily({
  key: "selectedPatchIds",
  get:
    (patchesField) =>
    ({ get }) => {
      const modal = get(modalSelector);
      const isPatches = get(isPatchesView);
      const selectedSamples = get(atoms.selectedSamples);
      const selectedSampleObjects = get(atoms.selectedSampleObjects);

      if (isPatches || modal) {
        return selectedSamples;
      }
      let patchIds: string[] = [];
      for (const sampleId of Array.from(selectedSamples)) {
        if (selectedSampleObjects.has(sampleId)) {
          const sample = selectedSampleObjects.get(sampleId);
          patchIds = [
            ...patchIds,
            ...getLabelIdsFromSample(
              sample,
              patchesField,
              get(pathFilter(false))
            ),
          ];
        }
      }
      return new Set(patchIds);
    },
});

export const selectedPatchSamples = selector({
  key: "selectedPatchSamples",
  get: ({ get }) => {
    const isPatches = get(isPatchesView);
    const selectedPatches = get(atoms.selectedSamples);
    const selectedSampleObjects = get(atoms.selectedSampleObjects);

    if (isPatches) {
      let sampleIds: string[] = [];
      for (const patchId of Array.from(selectedPatches)) {
        if (selectedSampleObjects.has(patchId)) {
          const sample = selectedSampleObjects.get(patchId);
          sampleIds = [...sampleIds, sample?._sample_id as unknown as string];
        }
      }
      return new Set(sampleIds);
    } else {
      return new Set();
    }
  },
});

function getLabelIdsFromSample(sample, path, matchesFilter) {
  const labelIds = [];
  const labelContainer = sample[path] || {};
  const containerKeys = Object.keys(labelContainer);
  const targetKey = Array.isArray(containerKeys)
    ? containerKeys[0]
    : "detections";
  const fullPath = [path, targetKey];
  const labels = Array.isArray(labelContainer[targetKey])
    ? labelContainer[targetKey]
    : [];

  for (const label of labels) {
    if (matchesFilter(fullPath.join("."), label)) labelIds.push(label.id);
  }

  return labelIds;
}

export const hasSelectedLabels = selector<boolean>({
  key: "hasSelectedLabels",
  get: ({ get }) => {
    const selected = get(selectedLabelIds);
    return selected.size > 0;
  },
});

export const hasSelectedSamples = selector<boolean>({
  key: "hasSelectedSamples",
  get: ({ get }) => {
    const selected = get(atoms.selectedSamples);
    return selected.size > 0;
  },
});

export const frameFieldsList = selector({
  key: "frameFieldsList",
  get: ({ get }) => {
    const fields = get(atoms.frameFields);
    return fields.map((f) => `frames.${f.path}`);
  },
});

export const isFrameField = selectorFamily({
  key: "isFrameField",
  get:
    (path: string) =>
    ({ get }) =>
      get(frameFieldsList).some((p) => path.startsWith(p)),
});

import {
  isRgbMaskTargets,
  normalizeMaskTargetsCase,
} from "@fiftyone/looker/src/overlays/util";
import { KeypointSkeleton, MaskTargets } from "@fiftyone/looker/src/state";
import { StateForm } from "@fiftyone/relay";
import { selectedFieldsStageState } from "@fiftyone/state";
import { toSnakeCase } from "@fiftyone/utilities";
import { atomFamily, selector, selectorFamily } from "recoil";
import { v4 as uuid } from "uuid";
import * as atoms from "./atoms";
import { selectedSamples } from "./atoms";
import { config } from "./config";
import { filters, modalFilters } from "./filters";
import { currentSlice } from "./groups";
import { isModalActive, modalSample } from "./modal";
import { pathFilter } from "./pathFilters";
import { fieldSchema } from "./schema";
import { State } from "./types";
import { isPatchesView } from "./view";

export const datasetName = selector<string>({
  key: "datasetName",
  get: ({ get }) => {
    return get(atoms.dataset)?.name;
  },
});

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
  get: ({ get }) => get(atoms.dataset)?.mediaType,
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const parentMediaTypeSelector = selector({
  key: "parentMediaTypeSelector",
  get: ({ get }) => get(atoms.dataset)?.parentMediaType,
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const savedViewsSelector = selector<State.SavedView[]>({
  key: "datasetViews",
  get: ({ get }) => get(atoms.dataset)?.savedViews || [],
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const isVideoDataset = selector({
  key: "isVideoDataset",
  get: ({ get }) => get(mediaTypeSelector) === "video",
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const isPointcloudDataset = selector({
  key: "isPointcloudDataset",
  get: ({ get }) => get(mediaTypeSelector) === "point_cloud",
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const timeZone = selector<string>({
  key: "timeZone",
  get: ({ get }) => {
    return get(config)?.timezone || "UTC";
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
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
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const appConfigOption = atomFamily<any, { key: string; modal: boolean }>(
  {
    key: "appConfigOptions",
    default: appConfigDefault,
  }
);

export const datasetAppConfig = selector<State.DatasetAppConfig>({
  key: "datasetAppConfig",
  get: ({ get }) => get(atoms.dataset)?.appConfig,
});

export const defaultTargets = selector({
  key: "defaultTargets",
  get: ({ get }) => {
    return normalizeMaskTargetsCase(
      (get(atoms.dataset).defaultMaskTargets || {}) as MaskTargets
    );
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const targets = selector({
  key: "targets",
  get: ({ get }) => {
    const defaults = normalizeMaskTargetsCase(
      (get(atoms.dataset).defaultMaskTargets || {}) as MaskTargets
    );
    const labelTargets = get(atoms.dataset)?.maskTargets || {};
    const labelTargetsCaseNormalized = Object.entries(labelTargets).reduce(
      (acc, [fieldName, fieldMaskTargets]) => {
        acc[fieldName] = normalizeMaskTargetsCase(
          fieldMaskTargets as MaskTargets
        );
        return acc;
      },
      {}
    );
    return {
      defaults,
      fields: labelTargetsCaseNormalized,
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
      const dataset = get(atoms.dataset);

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

export const selectedLabelIds = selector<Set<string>>({
  key: "selectedLabelIds",
  get: ({ get }) => {
    const labels = get(atoms.selectedLabels);
    return new Set(Object.keys(labels));
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const selectedLabelList = selector<State.SelectedLabel[]>({
  key: "selectedLabelList",
  get: ({ get }) => {
    const labels = get(atoms.selectedLabels);
    return Object.entries(labels).map(([labelId, label]) => ({
      labelId,
      ...label,
    }));
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
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
    const methods = get(atoms.dataset).brainMethods;

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
    const selectFieldsStage = get(selectedFieldsStageState) as {
      _cls: string;
      kwargs: string[];
    };

    return {
      ...get(extendedStagesUnsorted),
      "fiftyone.core.stages.SortBySimilarity": similarity
        ? toSnakeCase(similarity)
        : undefined,
      ...(selectFieldsStage
        ? { [selectFieldsStage["_cls"]]: selectFieldsStage["kwargs"] }
        : {}),
    };
  },
});

export const mediaFields = selector<string[]>({
  key: "string",
  get: ({ get }) => {
    const selectedFields = Object.keys(
      get(fieldSchema({ space: State.SPACE.SAMPLE }))
    );
    return (get(atoms.dataset)?.appConfig?.mediaFields || []).filter((field) =>
      selectedFields.includes(field)
    );
  },
});

export const viewStateForm = selectorFamily<
  StateForm,
  {
    addStages?: string;
    modal?: boolean;
    selectSlice?: boolean;
    omitSelected?: boolean;
  }
>({
  key: "viewStateForm",
  get:
    ({ addStages, modal, selectSlice, omitSelected }) =>
    ({ get }) => {
      return {
        filters: get(modal ? modalFilters : filters),
        sampleIds: omitSelected ? [] : [...get(selectedSamples)],
        labels: get(selectedLabelList),
        extended: get(extendedStages),
        slice: selectSlice ? get(currentSlice(modal)) : null,
        addStages: addStages ? JSON.parse(addStages) : [],
      };
    },
});
export const selectedPatchIds = selectorFamily({
  key: "selectedPatchIds",
  get:
    (patchesField) =>
    ({ get }) => {
      const modal = get(isModalActive);
      const isPatches = get(isPatchesView);
      const selectedSamples = get(atoms.selectedSamples);
      const selectedSampleObjects = get(atoms.selectedSampleObjects);

      if (isPatches || modal) {
        return selectedSamples;
      }
      let patchIds = [];
      for (const sampleId of selectedSamples) {
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
      let sampleIds = [];
      for (const patchId of selectedPatches) {
        if (selectedSampleObjects.has(patchId)) {
          const sample = selectedSampleObjects.get(patchId);
          sampleIds = [...sampleIds, sample._sample_id];
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

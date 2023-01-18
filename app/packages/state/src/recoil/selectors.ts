import { atomFamily, selector, selectorFamily } from "recoil";
import { v4 as uuid } from "uuid";

import { KeypointSkeleton } from "@fiftyone/looker/src/state";

import { isRgbMaskTargets } from "@fiftyone/looker/src/overlays/util";
import { StateForm } from "@fiftyone/relay";
import { toSnakeCase } from "@fiftyone/utilities";
import * as atoms from "./atoms";
import { selectedSamples } from "./atoms";
import { config } from "./config";
import { filters, modalFilters } from "./filters";
import { resolvedGroupSlice } from "./groups";
import { fieldSchema } from "./schema";
import { State } from "./types";
import _ from "lodash";
import { isPatchesView } from "./view";
import { pathFilter } from "./pathFilters";

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

export const mediaType = selector({
  key: "mediaType",
  get: ({ get }) => get(atoms.dataset)?.mediaType,
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
  get: ({ get }) => get(mediaType) === "video",
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
    return get(atoms.dataset).defaultMaskTargets || {};
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const targets = selector({
  key: "targets",
  get: ({ get }) => {
    const defaults = get(atoms.dataset).defaultMaskTargets || {};
    const labelTargets = get(atoms.dataset)?.maskTargets || {};
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
      } = get(atoms.modal);

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

export const similarityKeys = selector<{
  patches: [string, string][];
  samples: string[];
}>({
  key: "similarityKeys",
  get: ({ get }) => {
    const methods = get(atoms.dataset).brainMethods;
    return methods
      .filter(({ config: { method } }) => method === "similarity")
      .reduce(
        (
          { patches, samples },

          { config: { patchesField }, key }
        ) => {
          if (patchesField) {
            patches.push([key, patchesField]);
          } else {
            samples.push(key);
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
    const sampleIds = get(atoms.extendedSelection);
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

    return {
      ...get(extendedStagesUnsorted),
      "fiftyone.core.stages.SortBySimilarity": similarity
        ? toSnakeCase(similarity)
        : undefined,
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

export const modalNavigation = selector<atoms.ModalNavigation>({
  key: "modalNavigation",
  get: ({ get }) => get(atoms.modal).navigation,
});

export const viewStateForm = selectorFamily<
  StateForm,
  { addStages?: string; modal?: boolean; selectSlice?: boolean }
>({
  key: "viewStateForm",
  get:
    ({ addStages, modal, selectSlice }) =>
    ({ get }) => {
      return {
        filters: get(modal ? modalFilters : filters),
        sampleIds: [...get(selectedSamples)],
        labels: get(selectedLabelList),
        extended: get(extendedStages),
        slice: selectSlice ? get(resolvedGroupSlice(modal)) : null,
        addStages: addStages ? JSON.parse(addStages) : [],
      };
    },
});
export const selectedPatchIds = selectorFamily({
  key: "selectedPatchIds",
  get:
    (patchesField) =>
    ({ get }) => {
      const modal = get(atoms.modal);
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
  const labelContainer = sample[path];
  const fullPath = [path, "detections"];

  for (const label of labelContainer?.detections || []) {
    if (matchesFilter(fullPath.join("."), label)) labelIds.push(label.id);
  }
  return labelIds;
}

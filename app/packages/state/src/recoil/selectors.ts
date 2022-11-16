import { atomFamily, selector, selectorFamily } from "recoil";
import { v4 as uuid } from "uuid";

import { KeypointSkeleton } from "@fiftyone/looker/src/state";

import * as atoms from "./atoms";
import { State } from "./types";
import { toSnakeCase } from "@fiftyone/utilities";
import { config } from "./config";

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
    return get(atoms.appConfig)?.timezone || "UTC";
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

export const defaultTargets = selector({
  key: "defaultTargets",
  get: ({ get }) => {
    const targets = get(atoms.dataset).defaultMaskTargets || {};
    return Object.fromEntries(
      Object.entries(targets).map(([k, v]) => [parseInt(k, 10), v])
    );
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
      if (field in fields) {
        return fields[field][target];
      }
      return defaults[target];
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
    let values = [];
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

    for (let sampleId in value) {
      for (let field in value[sampleId]) {
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
    return get(atoms.dataset)?.appConfig?.mediaFields || [];
  },
});

export const modalNavigation = selector<atoms.ModalNavigation>({
  key: "modalNavigation",
  get: ({ get }) => get(atoms.modal).navigation,
});

import { getFetchFunction } from "@fiftyone/utilities";
import { atomFamily, selector, selectorFamily } from "recoil";
import { v4 as uuid } from "uuid";

import { Coloring } from "@fiftyone/looker";
import { getColor } from "@fiftyone/looker/src/color";
import { KeypointSkeleton } from "@fiftyone/looker/src/state";

import * as atoms from "./atoms";
import { State } from "./types";

export const refresher = (() => {
  let state = false;
  return selector<boolean>({
    key: "refresher",
    get: () => {
      state = !state;

      return state;
    },
    cachePolicy_UNSTABLE: {
      eviction: "most-recent",
    },
  });
})();

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

export const showTeamsButton = selector({
  key: "showTeamsButton",
  get: ({ get }) => {
    const teams = get(fiftyone).teams;
    const localTeams = get(atoms.teams);
    const storedTeams = window.localStorage.getItem("fiftyone-teams");
    if (storedTeams) {
      window.localStorage.removeItem("fiftyone-teams");
      getFetchFunction()("POST", "/teams?submitted=true");
    }
    if (
      teams.submitted ||
      localTeams.submitted ||
      storedTeams === "submitted"
    ) {
      return "hidden";
    }
    if (teams.minimized || localTeams.minimized) {
      return "minimized";
    }
    return "shown";
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const datasetName = selector({
  key: "datasetName",
  get: ({ get }) => get(atoms.stateDescription)?.dataset?.name,
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const datasets = selector({
  key: "datasets",
  get: ({ get }) => {
    return get(atoms.stateDescription)?.datasets ?? [];
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const hasDataset = selector({
  key: "hasDataset",
  get: ({ get }) => Boolean(get(datasetName)),
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const mediaType = selector({
  key: "mediaType",
  get: ({ get }) => get(atoms.stateDescription)?.dataset?.mediaType,
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

export const defaultGridZoom = selector<number>({
  key: "defaultGridZoom",
  get: ({ get }) => get(appConfig)?.gridZoom,
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const timeZone = selector<string>({
  key: "timeZone",
  get: ({ get }) => {
    return get(appConfig)?.timezone || "UTC";
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const appConfig = selector<State.Config>({
  key: "appConfig",
  get: ({ get }) => {
    return get(atoms.stateDescription).config || {};
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
  get: ({ modal, key }) => ({ get }) => {
    if (modal) {
      return get(appConfigDefault({ modal: false, key }));
    }

    return get(appConfig)[key];
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

export const colorMap = selectorFamily<(val) => string, boolean>({
  key: "colorMap",
  get: (modal) => ({ get }) => {
    get(appConfigOption({ key: "color_by_value", modal }));
    let pool = get(atoms.colorPool);
    pool = pool.length ? pool : [darkTheme.brand];
    const seed = get(atoms.colorSeed(modal));

    return createColorGenerator(pool, seed);
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const coloring = selectorFamily<Coloring, boolean>({
  key: "coloring",
  get: (modal) => ({ get }) => {
    const pool = get(atoms.colorPool);
    const seed = get(atoms.colorSeed(modal));
    return {
      seed,
      pool,
      scale: get(atoms.stateDescription).colorscale,
      by: get(appConfigOption({ key: "color_by", modal })),
      points: get(appConfigOption({ key: "multicolor_keypoints", modal })),
      defaultMaskTargets: get(defaultTargets),
      maskTargets: get(targets).fields,
      targets: new Array(pool.length)
        .fill(0)
        .map((_, i) => getColor(pool, seed, i)),
    };
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const defaultTargets = selector({
  key: "defaultTargets",
  get: ({ get }) => {
    const targets =
      get(atoms.stateDescription).dataset?.defaultMaskTargets || {};
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
    const defaults =
      get(atoms.stateDescription).dataset?.defaultMaskTargets || {};
    const labelTargets = get(atoms.stateDescription).dataset?.maskTargets || {};
    return {
      defaults,
      fields: labelTargets,
    };
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const skeleton = selectorFamily<KeypointSkeleton | null, string>({
  key: "skeleton",
  get: (field) => ({ get }) => {
    const dataset = get(atoms.stateDescription).dataset || {};
    const skeletons = dataset.skeletons || {};

    return skeletons[field] || dataset.default_skeleton || null;
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
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const hiddenLabelIds = selector({
  key: "hiddenLabelIds",
  get: ({ get }) => {
    return new Set(Object.keys(get(atoms.hiddenLabels)));
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
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
  get: (fieldName) => ({ get }) => {
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
    const methods = get(atoms.stateDescription).dataset.brainMethods;
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

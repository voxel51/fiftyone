import { getFetchFunction } from "@fiftyone/utilities";
import { selector, selectorFamily } from "recoil";

import socket, { handleId, isNotebook, http } from "../shared/connection";
import { packageMessage } from "../utils/socket";

import * as atoms from "./atoms";
import { State } from "./types";

export const isModalActive = selector<boolean>({
  key: "isModalActive",
  get: ({ get }) => {
    return Boolean(get(atoms.modal));
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const refresh = selector<boolean>({
  key: "refresh",
  get: ({ get }) => get(atoms.stateDescription)?.refresh,
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const deactivated = selector({
  key: "deactivated",
  get: ({ get }) => {
    const activeHandle = get(atoms.stateDescription)?.activeHandle;
    if (isNotebook) {
      return handleId !== activeHandle && typeof activeHandle === "string";
    }
    return false;
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const fiftyone = selector({
  key: "fiftyone",
  get: async () => {
    let response = null;
    do {
      try {
        response = await getFetchFunction()("GET", "/fiftyone");
      } catch {}
      if (response) break;
      await new Promise((r) => setTimeout(r, 2000));
    } while (response === null);
    return response;
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
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
  get: ({ get }) => get(atoms.stateDescription)?.config,
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
    const labels = get(selectedLabels);
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

export const selectedLabels = selector<State.SelectedLabelMap>({
  key: "selectedLabels",
  get: ({ get }) => {
    const labels: State.SelectedLabel[] =
      get(atoms.stateDescription)?.selectedLabels || [];
    return Object.fromEntries(labels.map((l) => [l.labelId, l]));
  },
  set: ({ get, set }, value) => {
    const state = get(atoms.stateDescription);
    const labels: State.SelectedLabel[] = Object.entries(value).map(
      ([labelId, label]) => ({
        ...label,
        labelId,
      })
    );
    const newState: State.Description = {
      ...state,
      selectedLabels: labels,
    };
    socket.send(
      packageMessage("set_selected_labels", { selected_labels: labels })
    );
    set(atoms.stateDescription, newState);
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

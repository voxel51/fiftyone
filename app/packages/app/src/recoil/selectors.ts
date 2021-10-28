import { DefaultValue, selector, selectorFamily } from "recoil";

import { Coloring, createColorGenerator } from "@fiftyone/looker";
import { getColor } from "@fiftyone/looker/src/color";

import { darkTheme } from "../shared/colors";
import socket, { handleId, isNotebook, http } from "../shared/connection";
import { packageMessage } from "../utils/socket";

import * as atoms from "./atoms";
import { State } from "./types";
import { setState } from "./utils";

export const isModalActive = selector<boolean>({
  key: "isModalActive",
  get: ({ get }) => {
    return Boolean(get(atoms.modal));
  },
});

export const refresh = selector<boolean>({
  key: "refresh",
  get: ({ get }) => get(atoms.stateDescription)?.refresh,
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
});

export const fiftyone = selector({
  key: "fiftyone",
  get: async () => {
    let response = null;
    do {
      try {
        response = await (await fetch(`${http}/fiftyone`)).json();
      } catch {}
      if (response) break;
      await new Promise((r) => setTimeout(r, 2000));
    } while (response === null);
    return response;
  },
});

export const showTeamsButton = selector({
  key: "showTeamsButton",
  get: ({ get }) => {
    const teams = get(fiftyone).teams;
    const localTeams = get(atoms.teamsSubmitted);
    const storedTeams = window.localStorage.getItem("fiftyone-teams");
    if (storedTeams) {
      window.localStorage.removeItem("fiftyone-teams");
      fetch(`${http}/teams?submitted=true`, { method: "post" });
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
});

export const datasetName = selector({
  key: "datasetName",
  get: ({ get }) => get(atoms.stateDescription)?.dataset?.name,
});

export const datasets = selector({
  key: "datasets",
  get: ({ get }) => {
    return get(atoms.stateDescription)?.datasets ?? [];
  },
});

export const hasDataset = selector({
  key: "hasDataset",
  get: ({ get }) => Boolean(get(datasetName)),
});

export const mediaType = selector({
  key: "mediaType",
  get: ({ get }) => get(atoms.stateDescription)?.dataset?.mediaType,
});

export const isVideoDataset = selector({
  key: "isVideoDataset",
  get: ({ get }) => get(mediaType) === "video",
});

export const gridZoom = selector<number>({
  key: "gridZoom",
  get: ({ get }) => get(appConfig)?.gridZoom,
  set: ({ get, set }, value) => {
    if (value instanceof DefaultValue) {
      value = 5;
    }

    const state = get(atoms.stateDescription);

    setState(set, {
      ...state,
      config: {
        ...state.config,
        gridZoom: value,
      },
    });
  },
});

export const timeZone = selector<string>({
  key: "timeZone",
  get: ({ get }) => {
    return get(appConfig)?.timezone || "UTC";
  },
});

export const appConfig = selector<State.Config>({
  key: "appConfig",
  get: ({ get }) => get(atoms.stateDescription)?.config,
});

export const colorMap = selectorFamily<(val) => string, boolean>({
  key: "colorMap",
  get: (modal) => ({ get }) => {
    const colorByLabel = get(atoms.colorByLabel(modal));
    let pool = get(atoms.colorPool);
    pool = pool.length ? pool : [darkTheme.brand];
    const seed = get(atoms.colorSeed(modal));

    return createColorGenerator(pool, seed);
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
      byLabel: get(atoms.colorByLabel(modal)),
      defaultMaskTargets: get(defaultTargets),
      maskTargets: get(targets).fields,
      targets: new Array(pool.length)
        .fill(0)
        .map((_, i) => getColor(pool, seed, i)),
    };
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
});

export const selectedLabelIds = selector<Set<string>>({
  key: "selectedLabelIds",
  get: ({ get }) => {
    const labels = get(selectedLabels);
    return new Set(Object.keys(labels));
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
});

export const hiddenLabelIds = selector({
  key: "hiddenLabelIds",
  get: ({ get }) => {
    return new Set(Object.keys(get(atoms.hiddenLabels)));
  },
});

export const selectedLabels = selector<atoms.SelectedLabelMap>({
  key: "selectedLabels",
  get: ({ get }) => {
    const labels = get(atoms.stateDescription)?.selectedLabels || [];
    if (labels) {
      return Object.fromEntries(labels.map((l) => [l.labelId, l]));
    }
    return {};
  },
  set: ({ get, set }, value) => {
    const state = get(atoms.stateDescription);
    const labels = Object.entries(value).map(([label_id, label]) => ({
      ...label,
      label_id,
    }));
    const newState = {
      ...state,
      selected_labels: labels,
    };
    socket.send(
      packageMessage("set_selected_labels", { selected_labels: labels })
    );
    set(atoms.stateDescription, newState);
  },
});

export const hiddenFieldLabels = selectorFamily<string[], string>({
  key: "hiddenFieldLabels",
  get: (fieldName) => ({ get }) => {
    const labels = get(atoms.hiddenLabels);
    const { sampleId } = get(atoms.modal);

    if (sampleId) {
      return Object.entries(labels)
        .filter(
          ([_, { sample_id: id, field }]) =>
            sampleId === id && field === fieldName
        )
        .map(([label_id]) => label_id);
    }
    return [];
  },
});

interface BrainMethod {
  config: {
    method: string;
    patches_field: string;
  };
}

interface BrainMethods {
  [key: string]: BrainMethod;
}

export const similarityKeys = selector<{
  patches: [string, string][];
  samples: string[];
}>({
  key: "similarityKeys",
  get: ({ get }) => {
    const state = get(atoms.stateDescription);
    const brainKeys = (state?.dataset?.brainMethods || {}) as BrainMethods;
    return Object.entries(brainKeys)
      .filter(
        ([
          _,
          {
            config: { method },
          },
        ]) => method === "similarity"
      )
      .reduce(
        (
          { patches, samples },
          [
            key,
            {
              config: { patches_field },
            },
          ]
        ) => {
          if (patches_field) {
            patches.push([key, patches_field]);
          } else {
            samples.push(key);
          }
          return { patches, samples };
        },
        { patches: [], samples: [] }
      );
  },
});

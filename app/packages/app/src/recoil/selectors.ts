import { selector, selectorFamily, SerializableParam } from "recoil";

import * as atoms from "./atoms";
import { generateColorMap } from "../utils/colors";
import {
  RESERVED_FIELDS,
  VALID_LABEL_TYPES,
  VALID_SCALAR_TYPES,
  makeLabelNameGroups,
  VALID_LIST_TYPES,
  UNSUPPORTED_IMAGE,
  VALID_LIST_FIELDS,
} from "../utils/labels";
import { packageMessage } from "../utils/socket";
import { viewsAreEqual } from "../utils/view";
import { darkTheme } from "../shared/colors";
import socket, { handleId, isNotebook, http } from "../shared/connection";

export const isModalActive = selector<boolean>({
  key: "isModalActive",
  get: ({ get }) => {
    return Boolean(get(atoms.modal));
  },
});

export const refresh = selector<boolean>({
  key: "refresh",
  get: ({ get }) => get(atoms.stateDescription).refresh,
});

export const deactivated = selector({
  key: "deactivated",
  get: ({ get }) => {
    const handle = handleId;
    const activeHandle = get(atoms.stateDescription)?.active_handle;

    const notebook = isNotebook;
    if (notebook) {
      return handle !== activeHandle && typeof activeHandle === "string";
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
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    return stateDescription.dataset ? stateDescription.dataset.name : null;
  },
});

export const viewCls = selector<string>({
  key: "viewCls",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    return stateDescription.view_cls;
  },
});

export const isRootView = selector<boolean>({
  key: "isRootView",
  get: ({ get }) => {
    return [undefined, null, "fiftyone.core.view.DatasetView"].includes(
      get(viewCls)
    );
  },
});

const CLIPS_VIEW = "fiftyone.core.clips.ClipsView";
const FRAMES_VIEW = "fiftyone.core.video.FramesView";
const EVALUATION_PATCHES_VIEW = "fiftyone.core.patches.EvaluationPatchesView";
const PATCHES_VIEW = "fiftyone.core.patches.PatchesView";
const PATCH_VIEWS = [PATCHES_VIEW, EVALUATION_PATCHES_VIEW];

enum ELEMENT_NAMES {
  CLIP = "clip",
  FRAME = "frame",
  PATCH = "patch",
  SAMPLE = "sample",
}

enum ELEMENT_NAMES_PLURAL {
  CLIP = "clips",
  FRAME = "frames",
  PATCH = "patches",
  SAMPLE = "samples",
}

export const rootElementName = selector<string>({
  key: "rootElementName",
  get: ({ get }) => {
    const cls = get(viewCls);
    if (PATCH_VIEWS.includes(cls)) {
      return ELEMENT_NAMES.PATCH;
    }

    if (cls === CLIPS_VIEW) return ELEMENT_NAMES.CLIP;

    if (cls === FRAMES_VIEW) return ELEMENT_NAMES.FRAME;

    return ELEMENT_NAMES.SAMPLE;
  },
});

export const rootElementNamePlural = selector<string>({
  key: "rootElementNamePlural",
  get: ({ get }) => {
    const elementName = get(rootElementName);

    switch (elementName) {
      case ELEMENT_NAMES.CLIP:
        return ELEMENT_NAMES_PLURAL.CLIP;
      case ELEMENT_NAMES.FRAME:
        return ELEMENT_NAMES_PLURAL.FRAME;
      case ELEMENT_NAMES.PATCH:
        return ELEMENT_NAMES_PLURAL.PATCH;
      default:
        return ELEMENT_NAMES_PLURAL.SAMPLE;
    }
  },
});

export const elementNames = selector<{ plural: string; singular: string }>({
  key: "elementNames",
  get: ({ get }) => {
    return {
      plural: get(rootElementNamePlural),
      singular: get(rootElementName),
    };
  },
});

export const isClipsView = selector<boolean>({
  key: "isClipsView",
  get: ({ get }) => {
    return get(rootElementName) === ELEMENT_NAMES.CLIP;
  },
});

export const isPatchesView = selector<boolean>({
  key: "isPatchesView",
  get: ({ get }) => {
    return get(rootElementName) === ELEMENT_NAMES.PATCH;
  },
});

export const isFramesView = selector<boolean>({
  key: "isFramesView",
  get: ({ get }) => {
    return get(rootElementName) === ELEMENT_NAMES.FRAME;
  },
});

export const datasets = selector({
  key: "datasets",
  get: ({ get }) => {
    return get(atoms.stateDescription).datasets ?? [];
  },
});

export const hasDataset = selector({
  key: "hasDataset",
  get: ({ get }) => Boolean(get(datasetName)),
});

export const mediaType = selector({
  key: "mediaType",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);

    return stateDescription.dataset
      ? stateDescription.dataset.media_type
      : null;
  },
});

export const isVideoDataset = selector({
  key: "isVideoDataset",
  get: ({ get }) => {
    return get(mediaType) === "video";
  },
});

export const view = selector<[]>({
  key: "view",
  get: ({ get }) => {
    return get(atoms.stateDescription).view || [];
  },
  set: ({ get, set }, stages) => {
    const state = get(atoms.stateDescription);
    const newState = {
      ...state,
      view: stages,
      selected: [],
      selected_labels: [],
      filters: {},
    };
    set(atoms.stateDescription, newState);
    socket.send(packageMessage("update", { state: newState }));
  },
});

export const datasetStats = selector({
  key: "datasetStats",
  get: ({ get }) => {
    const raw = get(atoms.datasetStatsRaw);
    const currentView = get(view);
    if (!raw.view) {
      return null;
    }
    if (viewsAreEqual(raw.view, currentView)) {
      return raw.stats;
    }
    return null;
  },
});

const normalizeFilters = (filters) => {
  const names = Object.keys(filters).sort();
  const list = names.map((n) => filters[n]);
  return JSON.stringify([names, list]);
};

export const filtersAreEqual = (filtersOne, filtersTwo) => {
  return normalizeFilters(filtersOne) === normalizeFilters(filtersTwo);
};

export const extendedDatasetStats = selector({
  key: "extendedDatasetStats",
  get: ({ get }) => {
    const raw = get(atoms.extendedDatasetStatsRaw);
    const currentView = get(view);
    if (!raw.view) {
      return null;
    }
    if (!viewsAreEqual(raw.view, currentView)) {
      return null;
    }
    const currentFilters = get(filterStages);
    if (!filtersAreEqual(raw.filters, currentFilters)) {
      return null;
    }

    return raw.stats;
  },
});

export const filterStages = selector<object>({
  key: "filterStages",
  get: ({ get }) => get(atoms.stateDescription).filters,
  set: ({ get, set }, filters) => {
    const state = {
      ...get(atoms.stateDescription),
      filters,
    };
    state.selected = [];
    set(atoms.selectedSamples, new Set());
    socket.send(packageMessage("filters_update", { filters }));
    set(atoms.stateDescription, state);
  },
});

export const totalCount = selector<number>({
  key: "totalCount",
  get: ({ get }) => {
    const stats = get(datasetStats) || [];
    return stats.reduce(
      (acc, cur) => (cur.name === null ? cur.result : acc),
      null
    );
  },
});

export const filteredCount = selector<number>({
  key: "filteredCount",
  get: ({ get }) => {
    const stats = get(extendedDatasetStats) || [];
    return stats.reduce(
      (acc, cur) => (cur.name === null ? cur.result : acc),
      null
    );
  },
});

export const currentCount = selector<number | null>({
  key: "currentCount",
  get: ({ get }) => {
    return get(filteredCount) || get(totalCount);
  },
});

export const labelTagsPaths = selector({
  key: "labelTagsPaths",
  get: ({ get }) => {
    const types = get(labelTypesMap);
    return get(labelPaths).map((path) => {
      path = VALID_LIST_TYPES.includes(types[path])
        ? `${path}.${types[path].toLocaleLowerCase()}`
        : path;
      return `${path}.tags`;
    });
  },
});

export const fieldSchema = selectorFamily({
  key: "fieldSchema",
  get: (dimension: string) => ({ get }) => {
    const d = get(atoms.stateDescription).dataset || {};
    return d[dimension + "_fields"] || [];
  },
});

const getLabelFilter = (video: boolean, dimension: string) => (f) => {
  if (!f.embedded_doc_type) {
    return false;
  }

  const type = f.embedded_doc_type.split(".").slice(-1)[0];
  return (
    ((dimension !== "frame" && video) || !UNSUPPORTED_IMAGE.includes(type)) &&
    VALID_LABEL_TYPES.includes(type)
  );
};

const primitiveFilter = (f) => {
  if (f.name.startsWith("_") || f.name === "tags") {
    return false;
  }

  if (VALID_SCALAR_TYPES.includes(f.ftype)) {
    return true;
  }

  if (
    VALID_LIST_FIELDS.includes(f.ftype) &&
    VALID_SCALAR_TYPES.includes(f.subfield)
  ) {
    return true;
  }

  return false;
};

const fields = selectorFamily<{ [key: string]: SerializableParam }, string>({
  key: "fields",
  get: (dimension: string) => ({ get }) => {
    return get(fieldSchema(dimension)).reduce((acc, cur) => {
      acc[cur.name] = cur;
      return acc;
    }, {});
  },
});

const selectedFields = selectorFamily({
  key: "selectedFields",
  get: (dimension: string) => ({ get }) => {
    const view_ = get(view);
    const fields_ = { ...get(fields(dimension)) };
    const video = get(isVideoDataset);
    view_.forEach(({ _cls, kwargs }) => {
      if (_cls === "fiftyone.core.stages.SelectFields") {
        const supplied = kwargs[0][1] ? kwargs[0][1] : [];
        let names = new Set([...supplied, ...RESERVED_FIELDS]);
        if (video && dimension === "frame") {
          names = new Set(
            Array.from(names).map((n) => n.slice("frames.".length))
          );
        }
        Object.keys(fields_).forEach((f) => {
          if (!names.has(f)) {
            delete fields_[f];
          }
        });
      } else if (_cls === "fiftyone.core.stages.ExcludeFields") {
        const supplied = kwargs[0][1] ? kwargs[0][1] : [];
        let names = Array.from(supplied);

        if (video && dimension === "frame") {
          names = names.map((n) => n.slice("frames.".length));
        } else if (video) {
          names = names.filter((n) => n.startsWith("frames."));
        }
        names.forEach((n) => {
          delete fields_[n];
        });
      }
    });
    return fields_;
  },
});

export const defaultGridZoom = selector<number | null>({
  key: "defaultGridZoom",
  get: ({ get }) => {
    return get(appConfig).default_grid_zoom;
  },
});

export const fieldPaths = selector({
  key: "fieldPaths",
  get: ({ get }) => {
    const excludePrivateFilter = (f) => !f.startsWith("_");
    const fieldsNames = Object.keys(get(selectedFields("sample"))).filter(
      excludePrivateFilter
    );
    if (get(mediaType) === "video") {
      return fieldsNames
        .concat(
          Object.keys(get(selectedFields("frame")))
            .filter(excludePrivateFilter)
            .map((f) => "frames." + f)
        )
        .sort();
    }
    return fieldsNames.sort();
  },
});

const labels = selectorFamily<
  { name: string; embedded_doc_type: string }[],
  string
>({
  key: "labels",
  get: (dimension: string) => ({ get }) => {
    const fieldsValue = get(selectedFields(dimension));
    const video = get(isVideoDataset) && get(isRootView);
    return Object.keys(fieldsValue)
      .map((k) => fieldsValue[k])
      .filter(getLabelFilter(video, dimension))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
  },
});

export const labelNames = selectorFamily<string[], string>({
  key: "labelNames",
  get: (dimension: string) => ({ get }) => {
    const l = get(labels(dimension));
    return l.map((l) => l.name);
  },
});

export const labelPaths = selector<string[]>({
  key: "labelPaths",
  get: ({ get }) => {
    const sampleLabels = get(labelNames("sample"));
    const frameLabels = get(labelNames("frame"));
    return sampleLabels.concat(frameLabels.map((l) => "frames." + l));
  },
});

export const labelTypesMap = selector<{ [key: string]: string }>({
  key: "labelTypesMap",
  get: ({ get }) => {
    const sampleLabels = get(labelNames("sample"));
    const sampleLabelTypes = get(labelTypes("sample"));
    const frameLabels = get(labelNames("frame"));
    const frameLabelTypes = get(labelTypes("frame"));
    const sampleTuples = sampleLabels.map((l, i) => [l, sampleLabelTypes[i]]);
    const frameTuples = frameLabels.map((l, i) => [
      `frames.${l}`,
      frameLabelTypes[i],
    ]);
    return Object.fromEntries(sampleTuples.concat(frameTuples));
  },
});

export const labelTypes = selectorFamily<string[], string>({
  key: "labelTypes",
  get: (dimension) => ({ get }) => {
    return get(labels(dimension)).map((l) => {
      return l.embedded_doc_type.split(".").slice(-1)[0];
    });
  },
});

const primitives = selectorFamily({
  key: "primitives",
  get: (dimension: string) => ({ get }) => {
    const fieldsValue = get(selectedFields(dimension));
    return Object.keys(fieldsValue)
      .map((k) => fieldsValue[k])
      .filter(primitiveFilter);
  },
});

export const primitiveNames = selectorFamily({
  key: "primitiveNames",
  get: (dimension: string) => ({ get }) => {
    const l = get(primitives(dimension));
    return l.map((l) => l.name);
  },
});

export const primitiveTypes = selectorFamily({
  key: "primitiveTypes",
  get: (dimension: string) => ({ get }) => {
    const l = get(primitives(dimension));
    return l.map((l) => l.ftype);
  },
});

export const primitiveSubfields = selectorFamily({
  key: "primitiveSubfields",
  get: (dimension: string) => ({ get }) => {
    const l = get(primitives(dimension));
    return l.map((l) => l.subfield);
  },
});

export const primitivesSchema = selectorFamily({
  key: "primitivesSchema",
  get: (dimension: string) => ({ get }) => {
    return Object.fromEntries(
      get(primitives(dimension)).map((p) => [p.name, p])
    );
  },
});

export const labelTuples = selectorFamily({
  key: "labelTuples",
  get: (dimension: string) => ({ get }) => {
    const types = get(labelTypes(dimension));
    return get(labelNames(dimension)).map((n, i) => [n, types[i]]);
  },
});

export const labelMap = selectorFamily({
  key: "labelMap",
  get: (dimension: string) => ({ get }) => {
    const tuples = get(labelTuples(dimension));
    return tuples.reduce((acc, cur) => {
      return {
        [cur[0]]: cur[1],
        ...acc,
      };
    }, {});
  },
});

export const primitivesMap = selectorFamily<{ [key: string]: string }, string>({
  key: "primitivesMap",
  get: (dimension) => ({ get }) => {
    const types = get(primitiveTypes(dimension));
    return get(primitiveNames(dimension)).reduce(
      (acc, cur, i) => ({
        ...acc,
        [cur]: types[i],
      }),
      {}
    );
  },
});

export const primitivesSubfieldMap = selectorFamily<
  { [key: string]: string },
  string
>({
  key: "primitivesSubfieldMap",
  get: (dimension) => ({ get }) => {
    const subfields = get(primitiveSubfields(dimension));
    return get(primitiveNames(dimension)).reduce(
      (acc, cur, i) => ({
        ...acc,
        [cur]: subfields[i],
      }),
      {}
    );
  },
});

export const primitivesDbMap = selectorFamily<
  { [key: string]: string },
  string
>({
  key: "primitivesDbMap",
  get: (dimension) => ({ get }) => {
    const values = get(primitives(dimension));
    return get(primitiveNames(dimension)).reduce(
      (acc, cur, i) => ({
        ...acc,
        [cur]: values[i].db_field,
      }),
      { media_type: "_media_type" }
    );
  },
});

export const appConfig = selector({
  key: "appConfig",
  get: ({ get }) => {
    return get(atoms.stateDescription).config || {};
  },
});

export const colorMap = selectorFamily<(val) => string, boolean>({
  key: "colorMap",
  get: (modal) => ({ get }) => {
    const colorByLabel = get(atoms.colorByLabel(modal));
    let pool = get(atoms.colorPool);
    pool = pool.length ? pool : [darkTheme.brand];
    const seed = get(atoms.colorSeed(modal));

    return generateColorMap(pool, seed);
  },
});

export const labelNameGroups = selectorFamily({
  key: "labelNameGroups",
  get: (dimension: string) => ({ get }) =>
    makeLabelNameGroups(
      get(selectedFields(dimension)),
      get(labelNames(dimension)),
      get(labelTypes(dimension))
    ),
});

export const defaultTargets = selector({
  key: "defaultTargets",
  get: ({ get }) => {
    const targets =
      get(atoms.stateDescription).dataset?.default_mask_targets || {};
    return Object.fromEntries(
      Object.entries(targets).map(([k, v]) => [parseInt(k, 10), v])
    );
  },
});

export const targets = selector({
  key: "targets",
  get: ({ get }) => {
    const defaults =
      get(atoms.stateDescription).dataset?.default_mask_targets || {};
    const labelTargets =
      get(atoms.stateDescription).dataset?.mask_targets || {};
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
    const labels = get(atoms.stateDescription).selected_labels;
    if (labels) {
      return Object.fromEntries(labels.map((l) => [l.label_id, l]));
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

export const fieldType = selectorFamily<string, string>({
  key: "fieldType",
  get: (path) => ({ get }) => {
    const frame = path.startsWith("frames.") && get(isVideoDataset);

    const entry = get(fields(frame ? "frame" : "sample"));
    return frame
      ? entry[path.slice("frames.".length)].ftype
      : entry[path].ftype;
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
    const brainKeys = (state?.dataset?.brain_methods || {}) as BrainMethods;
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

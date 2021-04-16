import { selector, selectorFamily, SerializableParam } from "recoil";

import * as atoms from "./atoms";
import { ColorGenerator } from "player51";
import { generateColorMap } from "../utils/colors";
import {
  RESERVED_FIELDS,
  VALID_LABEL_TYPES,
  VALID_SCALAR_TYPES,
  makeLabelNameGroups,
  labelTypeHasColor,
  AGGS,
  VALID_LIST_TYPES,
  HIDDEN_LABEL_ATTRS,
  LABEL_LIST,
} from "../utils/labels";
import { packageMessage } from "../utils/socket";
import { viewsAreEqual } from "../utils/view";
import { darkTheme } from "../shared/colors";
import socket, { handleId, isNotebook, http } from "../shared/connection";

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
        response = await fetch(`${http}/fiftyone`);
      } catch {}
      if (response) break;
      await new Promise((r) => setTimeout(r, 2000));
    } while (response === null);
    const data = await response.json();
    return data;
  },
});

export const showFeedbackButton = selector({
  key: "showFeedbackButton",
  get: ({ get }) => {
    const feedback = get(fiftyone).feedback;
    const localFeedback = get(atoms.feedbackSubmitted);
    const storedFeedback = window.localStorage.getItem("fiftyone-feedback");
    if (storedFeedback) {
      window.localStorage.removeItem("fiftyone-feedback");
      fetch(`${http}/feedback?submitted=true`, { method: "post" });
    }
    if (
      feedback.submitted ||
      localFeedback.submitted ||
      storedFeedback === "submitted"
    ) {
      return "hidden";
    }
    if (feedback.minimized || localFeedback.minimized) {
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

export const filterStages = selector({
  key: "filterStages",
  get: ({ get }) => {
    return get(atoms.stateDescription).filters;
  },
  set: ({ get, set }, filters) => {
    const state = {
      ...get(atoms.stateDescription),
      filters,
    };
    state.selected.forEach((id) => {
      set(atoms.isSelectedSample(id), false);
    });
    state.selected = [];
    set(atoms.selectedSamples, new Set());
    socket.send(packageMessage("filters_update", { filters }));
    set(atoms.stateDescription, state);
  },
});

export const hasFilters = selector<boolean>({
  key: "hasFilters",
  get: ({ get }) => Object.keys(get(filterStages)).length > 0,
});

export const filterStage = selectorFamily<any, string>({
  key: "filterStage",
  get: (path) => ({ get }) => {
    return get(filterStages)?.[path] ?? {};
  },
  set: (path: string) => ({ get, set }, filter) => {
    const filters = Object.assign({}, get(filterStages));
    if (filter === null) {
      delete filters[path];
    } else {
      filters[path] = filter;
    }
    set(filterStages, filters);
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
      return raw.stats.main;
    }
    return null;
  },
});

export const noneFieldCounts = selector<{ [key: string]: number }>({
  key: "noneFieldCounts",
  get: ({ get }) => {
    const raw = get(atoms.datasetStatsRaw);
    const currentView = get(view);
    if (!raw.view) {
      return {};
    }
    if (viewsAreEqual(raw.view, currentView)) {
      return raw.stats.none.reduce((acc, cur) => {
        acc[cur.name] = cur.result;
        return acc;
      }, {});
    }
    return {};
  },
});

const normalizeFilters = (filters) => {
  const names = Object.keys(filters).sort();
  const list = names.map((n) => filters[n]);
  return JSON.stringify([names, list]);
};

const filtersAreEqual = (filtersOne, filtersTwo) => {
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

    return raw.stats.main;
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

export const tagNames = selector<string[]>({
  key: "tagNames",
  get: ({ get }) => {
    return (get(datasetStats) ?? []).reduce((acc, cur) => {
      if (cur.name === "tags") {
        return Object.keys(cur.result).sort();
      }
      return acc;
    }, []);
  },
});

export const labelTagNames = selector<string[]>({
  key: "labelTagNames",
  get: ({ get }) => {
    const paths = get(labelTagsPaths);
    const result = new Set<string>();
    (get(datasetStats) ?? []).forEach((s) => {
      if (paths.includes(s.name)) {
        Object.keys(s.result).forEach((t) => result.add(t));
      }
    });

    return Array.from(result).sort();
  },
});

export const labelTagCounts = selector<{ [key: string]: number }>({
  key: "labelTagCounts",
  get: ({ get }) => {
    const paths = get(labelPaths).map((p) => p + ".tags");
    const result = {};
    (get(datasetStats) ?? []).forEach((s) => {
      if (paths.includes(s.name)) {
        Object.entries(s.result).forEach(([tag, count]) => {
          if (!(tag in result)) {
            result[tag] = 0;
          }
          result[tag] += count;
        });
      }
    });

    return result;
  },
});

export const filteredLabelTagCounts = selector<{ [key: string]: number }>({
  key: "filteredLabelTagCounts",
  get: ({ get }) => {
    const paths = get(labelPaths).map((p) => p + ".tags");
    const result = {};
    (get(extendedDatasetStats) ?? []).forEach((s) => {
      if (paths.includes(s.name)) {
        Object.entries(s.result).forEach(([tag, count]) => {
          if (!(tag in result)) {
            result[tag] = 0;
          }
          result[tag] += count;
        });
      }
    });

    return result;
  },
});

export const tagSampleCounts = selector({
  key: "tagSampleCounts",
  get: ({ get }) => {
    const stats = get(datasetStats);

    return stats
      ? stats.reduce((acc, cur) => {
          if (cur.name === "tags") {
            return cur.result;
          }
          return acc;
        }, {})
      : {};
  },
});

export const filteredTagSampleCounts = selector({
  key: "filteredTagSampleCounts",
  get: ({ get }) => {
    const stats = get(extendedDatasetStats);

    return stats
      ? stats.reduce((acc, cur) => {
          if (cur.name === "tags") {
            return cur.result;
          }
          return acc;
        }, {})
      : {};
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

export const labelTagSampleCounts = selector({
  key: "labelTagSampleCounts",
  get: ({ get }) => {
    const stats = get(datasetStats);
    const paths = get(labelTagsPaths);

    const result = {};

    stats &&
      stats.forEach((s) => {
        if (paths.includes(s.name)) {
          Object.entries(s.result).forEach(([k, v]) => {
            if (!(k in result)) {
              result[k] = v;
            } else {
              result[k] += v;
            }
          });
        }
      });

    return result;
  },
});

export const filteredLabelTagSampleCounts = selector({
  key: "filteredLabelTagSampleCounts",
  get: ({ get }) => {
    const stats = get(extendedDatasetStats);
    const paths = get(labelTagsPaths);

    const result = {};

    stats &&
      stats.forEach((s) => {
        if (paths.includes(s.name)) {
          Object.entries(s.result).forEach(([k, v]) => {
            if (!(k in result)) {
              result[k] = v;
            } else {
              result[k] += v;
            }
          });
        }
      });
    return result;
  },
});

export const fieldSchema = selectorFamily({
  key: "fieldSchema",
  get: (dimension: string) => ({ get }) => {
    const d = get(atoms.stateDescription).dataset || {};
    return d[dimension + "_fields"] || [];
  },
});

const labelFilter = (f) => {
  return (
    f.embedded_doc_type &&
    VALID_LABEL_TYPES.includes(f.embedded_doc_type.split(".").slice(-1)[0])
  );
};

const scalarFilter = (f) => {
  return (
    VALID_SCALAR_TYPES.includes(f.ftype) &&
    !f.name.startsWith("_") &&
    f.name !== "filepath"
  );
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

export const defaultPlayerOverlayOptions = selector({
  key: "defaultPlayerOverlayOptions",
  get: ({ get }) => {
    const showAttrs = get(appConfig).show_attributes;
    const showConfidence = get(appConfig).show_confidence;
    const showTooltip = get(appConfig).show_tooltip;
    return {
      showAttrs,
      showConfidence,
      showTooltip,
    };
  },
});

export const playerOverlayOptions = selector({
  key: "playerOverlayOptions",
  get: ({ get }) => {
    return {
      ...get(defaultPlayerOverlayOptions),
      ...get(atoms.savedPlayerOverlayOptions),
    };
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
    return Object.keys(fieldsValue)
      .map((k) => fieldsValue[k])
      .filter(labelFilter)
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

const scalars = selectorFamily({
  key: "scalars",
  get: (dimension: string) => ({ get }) => {
    const fieldsValue = get(selectedFields(dimension));
    return Object.keys(fieldsValue)
      .map((k) => fieldsValue[k])
      .filter(scalarFilter);
  },
});

export const scalarNames = selectorFamily({
  key: "scalarNames",
  get: (dimension: string) => ({ get }) => {
    const l = get(scalars(dimension));
    return l.map((l) => l.name);
  },
});

export const scalarTypes = selectorFamily({
  key: "scalarTypes",
  get: (dimension: string) => ({ get }) => {
    const l = get(scalars(dimension));
    return l.map((l) => l.ftype);
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

export const scalarsMap = selectorFamily<{ [key: string]: string }, string>({
  key: "scalarsMap",
  get: (dimension) => ({ get }) => {
    const types = get(scalarTypes(dimension));
    return get(scalarNames(dimension)).reduce(
      (acc, cur, i) => ({
        ...acc,
        [cur]: types[i],
      }),
      {}
    );
  },
});

export const appConfig = selector({
  key: "appConfig",
  get: ({ get }) => {
    return get(atoms.stateDescription).config || {};
  },
});

export const colorMap = selectorFamily<{ [key: string]: string }, boolean>({
  key: "colorMap",
  get: (modal) => ({ get }) => {
    const colorByLabel = get(atoms.colorByLabel(modal));
    let pool = get(atoms.colorPool);
    pool = pool.length ? pool : [darkTheme.brand];
    const seed = get(atoms.colorSeed(modal));

    const tags = [
      ...get(tagNames).map((t) => "tags." + t),
      ...get(labelTagNames).map((t) => "_label_tags." + t),
    ];
    if (colorByLabel) {
      let values = ["true", "false"];
      const stats = get(datasetStats);
      Object.values(stats).forEach(({ result, _CLS }) => {
        if (_CLS === AGGS.DISTINCT) {
          values = [...values, ...result];
        }
      });
      values = [...tags, ...values];
      return generateColorMap(pool, Array.from(new Set(values)), seed, false);
    } else {
      const colorLabelNames = get(labelTuples("sample"))
        .filter(([name, type]) => labelTypeHasColor(type))
        .map(([name]) => name);
      const colorFrameLabelNames = get(labelTuples("frame"))
        .filter(([name, type]) => labelTypeHasColor(type))
        .map(([name]) => "frames." + name);
      const scalarsList = [
        ...get(scalarNames("sample")),
        ...get(scalarNames("frame")),
      ];

      return generateColorMap(
        pool,
        [...tags, ...scalarsList, ...colorLabelNames, ...colorFrameLabelNames],
        seed
      );
    }
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

export const modalSample = selector({
  key: "modalSample",
  get: ({ get }) => {
    const id = get(atoms.modal).sample_id;
    return get(atoms.sample(id));
  },
});

export const tagSampleModalCounts = selector<{ [key: string]: number }>({
  key: "tagSampleModalCounts",
  get: ({ get }) => {
    const sample = get(modalSample);
    const tags = get(tagNames);
    return tags.reduce((acc, cur) => {
      acc[cur] = sample.tags.includes(cur) ? 1 : 0;
      return acc;
    }, {});
  },
});

export const selectedLabelIds = selector<Set<string>>({
  key: "selectedLabelIds",
  get: ({ get }) => {
    const labels = get(selectedLabels);
    return new Set(Object.keys(labels));
  },
});

export const currentSamples = selector<string[]>({
  key: "currentSamples",
  get: ({ get }) => {
    const { rows } = get(atoms.gridRows);
    return rows.map((r) => r.samples).flat();
  },
});

export const sampleIndices = selector<{ [key: string]: number }>({
  key: "sampleIndices",
  get: ({ get }) =>
    Object.fromEntries(get(currentSamples).map((id, i) => [id, i])),
});

export const sampleIds = selector<{ [key: number]: string }>({
  key: "sampleIdx",
  get: ({ get }) =>
    Object.fromEntries(get(currentSamples).map((id, i) => [i, id])),
});

export const sampleFramesMap = selectorFamily<any, string>({
  key: "sampleFramesMap",
  get: (id) => ({ get }) => {
    const frameData = get(atoms.sampleFrameData(id));

    return frameData
      ? Object.fromEntries(frameData.map((f) => [f.frame_number, f]))
      : {};
  },
});

export const selectedLoading = selector({
  key: "selectedLoading",
  get: ({ get }) => {
    const ids = get(atoms.selectedSamples);
    let loading = false;
    ids.forEach((id) => {
      loading = get(atoms.sample(id)) === null;
    });
    return loading;
  },
});

export const modalLabelAttrs = selectorFamily<
  [string, string | null | number],
  { field: string; id: string; frameNumber?: number }
>({
  key: "modalLabelAttrs",
  get: ({ field, id, frameNumber }) => ({ get }) => {
    let sample = get(modalSample);
    const type = get(labelTypesMap)[field];
    if (get(isVideoDataset) && field.startsWith("frames.")) {
      field = field.slice("frames.".length);
      sample = get(sampleFramesMap(sample._id))[frameNumber];
      if (!sample && frameNumber === 1) {
        sample = get(modalSample).frames;
      } else if (!sample) {
        return [];
      }
    }

    let label = sample[field];
    if (VALID_LIST_TYPES.includes(type)) {
      label = label[LABEL_LIST[type]].filter((l) => l._id === id)[0];
    }

    const hidden = HIDDEN_LABEL_ATTRS[label._cls];
    let attrs = Object.entries(label)
      .filter((a) => !hidden.includes(a[0]) && !a[0].startsWith("_"))
      .map(([k, v]) => [
        k,
        typeof v === "object" && k !== "tags"
          ? Array.isArray(v)
            ? "[...]"
            : "{...}"
          : v,
      ]);
    if (label.attributes) {
      attrs = [
        ...Object.entries(label.attributes).map(([k, v]) => [
          `attributes.${k}`,
          v.value,
        ]),
        ...attrs,
      ];
    }
    return attrs.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  },
});

export const modalLabelTags = selectorFamily<
  string[],
  { field: string; id: string; frameNumber?: number }
>({
  key: "modalLabelTags",
  get: (params) => ({ get }) => {
    const all = get(modalLabelAttrs(params));
    if (all.length) {
      const tags = get(modalLabelAttrs(params)).filter(
        ([k, v]) => k === "tags"
      );
      return tags && tags[0] && tags[0][1] ? Array.from(tags[0][1]) : [];
    }
    return [];
  },
});

export const colorGenerator = selectorFamily<any, boolean>({
  key: "colorGenerator",
  get: (modal) => ({ get }) => {
    return new ColorGenerator(get(atoms.colorSeed(modal)));
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

export const currentSamplesSize = selector<number>({
  key: "currentSamplesSize",
  get: ({ get }) => {
    return get(currentSamples).length;
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
    const { sample_id } = get(atoms.modal);

    if (sample_id) {
      return Object.entries(labels)
        .filter(
          ([_, { sample_id: id, field }]) =>
            sample_id === id && field === fieldName
        )
        .map(([label_id]) => label_id);
    }
    return [];
  },
});

export const matchedTags = selectorFamily<
  Set<string>,
  { key: string; modal: boolean }
>({
  key: "matchedTags",
  get: ({ key, modal }) => ({ get }) => {
    if (modal) {
      return get(atoms.matchedTagsModal(key));
    }
    const tags = get(filterStages).tags;
    if (tags && tags[key]) {
      return new Set(tags[key]);
    }
    return new Set();
  },
  set: ({ key, modal }) => ({ get, set }, value) => {
    if (modal) {
      set(atoms.matchedTagsModal(key), value);
    } else {
      const stages = { ...get(filterStages) };
      const tags = { ...(stages.tags || {}) };
      if (value instanceof Set && value.size) {
        tags[key] = Array.from(value);
      } else if (stages.tags && key in stages.tags) {
        delete tags[key];
      }
      stages.tags = tags;
      if (Object.keys(stages.tags).length === 0) {
        delete stages["tags"];
      }
      set(filterStages, stages);
    }
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

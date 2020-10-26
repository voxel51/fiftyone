import { selector, selectorFamily } from "recoil";
import * as atoms from "./atoms";
import { generateColorMap } from "../utils/colors";
import {
  RESERVED_FIELDS,
  VALID_LABEL_TYPES,
  VALID_LIST_TYPES,
  VALID_NUMERIC_TYPES,
  makeLabelNameGroups,
  labelTypeHasColor,
} from "../utils/labels";
import { getSocket } from "../utils/socket";

export const socket = selector({
  key: "socket",
  get: ({ get }) => {
    return getSocket(get(atoms.port), "state");
  },
  dangerouslyAllowMutability: true,
});

export const datasetName = selector({
  key: "datasetName",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    return stateDescription.dataset ? stateDescription.dataset.name : null;
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

export const view = selector({
  key: "view",
  get: ({ get }) => {
    return get(atoms.stateDescription).view || [];
  },
  set: ({ get }, stages) => {
    const state = get(atoms.stateDescription);
    return {
      ...state,
      view: stages,
    };
  },
});

export const totalCount = selector({
  key: "totalCount",
  get: ({ get }): number => {
    return get(atoms.datasetStats).reduce(
      (acc, cur) => (cur.name === "count" ? cur.count : acc),
      0
    );
  },
});

export const filterStage = selectorFamily({
  key: "filterStage",
  get: (fieldName: string) => ({ get }) => {
    const state = get(atoms.stateDescription);
    return state.filters ? state.filters[fieldName] : null;
  },
});

export const filteredCount = selector({
  key: "filteredCount",
  get: ({ get }): number => {
    return get(atoms.extendedDatasetStats).count;
  },
});

export const tagNames = selector({
  key: "tagNames",
  get: ({ get }) => {
    const tags = get(atoms.datasetStats).tags || {};
    return Object.keys(tags).sort();
  },
});

export const tagSampleCounts = selector({
  key: "tagSampleCounts",
  get: ({ get }) => {
    return get(atoms.datasetStats).tags || {};
  },
});

export const filteredTagSampleCounts = selector({
  key: "filteredTagSampleCounts",
  get: ({ get }) => {
    return get(atoms.extendedDatasetStats).tags || {};
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

const fields = selectorFamily({
  key: "fields",
  get: (dimension: string) => ({ get }) => {
    return get(fieldSchema(dimension)).reduce((acc, cur) => {
      acc[cur.name] = cur;
      return acc;
    }, {});
  },
});

const labels = selectorFamily({
  key: "labels",
  get: (dimension: string) => ({ get }) => {
    const fieldsValue = get(fields(dimension));
    return Object.keys(fieldsValue)
      .map((k) => fieldsValue[k])
      .filter(labelFilter);
  },
});

export const labelNames = selectorFamily({
  key: "labelNames",
  get: (dimension: string) => ({ get }) => {
    const l = get(labels(dimension));
    return l.map((l) => l.name);
  },
});

export const labelTypes = selectorFamily({
  key: "labelTypes",
  get: (dimension: string) => ({ get }) => {
    return get(labels(dimension)).map((l) => {
      return l.embedded_doc_type.split(".").slice(-1)[0];
    });
  },
});

const COUNT_CLS = "fiftyone.core.aggregations.CountResult";
const LABELS_CLS = "fiftyone.core.aggregations.DistinctLabelsResult";

export const labelClasses = selectorFamily({
  key: "labelClasses",
  get: (label) => ({ get }) => {
    return get(atoms.datasetStats).reduce((acc, cur) => {
      if (cur.name === label && cur._CLS === LABELS_CLS) {
        return cur.labels;
      }
      return acc;
    }, []);
  },
});

export const labelSampleCounts = selectorFamily({
  key: "labelSampleCounts",
  get: (dimension: string) => ({ get }) => {
    const names = get(labelNames(dimension));
    const prefix = dimension === "sample" ? "" : "frames.";
    return get(atoms.datasetStats).reduce((acc, cur) => {
      if (
        names.includes(cur.name.slice(prefix.length)) &&
        cur._CLS === COUNT_CLS
      ) {
        console.log(cur, prefix);
        acc[cur.name.slice(prefix.length)] = cur.count;
      }
      return acc;
    }, {});
  },
});

export const filteredLabelSampleCounts = selectorFamily({
  key: "filteredLabelSampleCounts",
  get: (dimension: string) => ({ get }) => {
    const names = get(labelNames(dimension));
    const prefix = dimension === "sample" ? "" : "frames.";
    return get(atoms.datasetStats).reduce((acc, cur) => {
      if (
        names.includes(cur.name.slice(prefix.length)) &&
        cur._CLS === COUNT_CLS
      ) {
        acc[cur.name.slice(prefix.length)] = cur.count;
      }
      return acc;
    }, {});
  },
});

export const labelFilters = selector({
  key: "labelFilters",
  get: ({ get }) => {
    const labels = get(atoms.activeLabels("sample"));
    const filters = {};
    for (const label in labels) {
      const range = get(atoms.filterLabelConfidenceRange(label));
      const none = get(atoms.filterLabelIncludeNoConfidence(label));
      const include = get(atoms.filterIncludeLabels(label));
      filters[label] = (s) => {
        const inRange = range[0] <= s.confidence && s.confidence <= range[1];
        const noConfidence = none && s.confidence === undefined;
        const isIncluded = include.length === 0 || include.includes(s.label);
        return (inRange || noConfidence) && isIncluded;
      };
    }
    return filters;
  },
});

export const modalLabelFilters = selector({
  key: "modalLabelFilters",
  get: ({ get }) => {
    const labels = get(atoms.modalActiveLabels("sample"));
    const filters = {};
    for (const label in labels) {
      const range = get(atoms.modalFilterLabelConfidenceRange(label));
      const none = get(atoms.modalFilterLabelIncludeNoConfidence(label));
      const include = get(atoms.modalFilterIncludeLabels(label));
      filters[label] = (s) => {
        const inRange = range[0] <= s.confidence && s.confidence <= range[1];
        const noConfidence = none && s.confidence === undefined;
        const isIncluded = include.length === 0 || include.includes(s.label);
        return labels[label] && (inRange || noConfidence) && isIncluded;
      };
    }
    return filters;
  },
  set: ({ get, set }, _) => {
    const active = get(atoms.activeLabels("sample"));
    set(atoms.modalActiveLabels("sample"), active);
    for (const label in active) {
      set(
        atoms.modalFilterLabelConfidenceRange(label),
        get(atoms.filterLabelConfidenceRange(label))
      );

      set(
        atoms.modalFilterLabelIncludeNoConfidence(label),
        get(atoms.filterLabelIncludeNoConfidence(label))
      );

      set(
        atoms.modalFilterIncludeLabels(label),
        get(atoms.filterIncludeLabels(label))
      );
    }
  },
});

export const refreshColorMap = selector({
  key: "refreshColorMap",
  get: ({ get }) => get(atoms.colorMap),
  set: ({ get, set }, colorMap) => {
    const colorLabelNames = Object.entries(get(labelTypes("sample")))
      .filter(([name, type]) => labelTypeHasColor(type))
      .map(([name]) => name);
    const colorFrameLabelNames = Object.entries(get(labelTypes("frame")))
      .filter(([name, type]) => labelTypeHasColor(type))
      .map(([name]) => "frames." + name);
    set(
      atoms.colorMap,
      generateColorMap(
        [...get(tagNames), ...colorLabelNames, ...colorFrameLabelNames],
        colorMap
      )
    );
  },
});

export const isLabel = selectorFamily({
  key: "isLabel",
  get: (field) => ({ get }) => {
    const types = get(labelTypes("sample"));
    return Boolean(types[field]);
  },
});

export const modalFieldIsFiltered = selectorFamily({
  key: "modalFieldIsFiltered",
  get: (field: string) => ({ get }): boolean => {
    const label = get(isLabel(field));

    if (!label) {
      return false;
    }

    const range = get(atoms.modalFilterLabelConfidenceRange(field));
    const bounds = get(labelConfidenceBounds(field));
    const none = get(atoms.modalFilterLabelIncludeNoConfidence(field));
    const include = get(atoms.modalFilterIncludeLabels(field));
    const maxMin = label ? 0 : bounds[0];
    const minMax = label ? 1 : bounds[1];
    const stretchedBounds = [
      maxMin < bounds[0] && bounds[1] !== bounds[0] ? maxMin : bounds[0],
      minMax > bounds[1] && bounds[1] !== bounds[0] ? minMax : bounds[1],
    ];

    const rangeIsFiltered =
      stretchedBounds.some(
        (b, i) => range[i] !== b && b !== null && range[i] !== null
      ) && bounds[0] !== bounds[1];

    return Boolean(include.length) || rangeIsFiltered || !none;
  },
});

export const fieldIsFiltered = selectorFamily({
  key: "fieldIsFiltered",
  get: (field: string) => ({ get }): boolean => {
    const label = get(isLabel(field));
    const numeric = get(isNumericField(field));
    const range = get(
      label
        ? atoms.filterLabelConfidenceRange(field)
        : atoms.filterNumericFieldRange(field)
    );
    const bounds = get(
      label ? labelConfidenceBounds(field) : numericFieldBounds(field)
    );
    const none = get(
      label
        ? atoms.filterLabelIncludeNoConfidence(field)
        : atoms.filterNumericFieldIncludeNone(field)
    );
    const include = get(atoms.filterIncludeLabels(field));
    const maxMin = label ? 0 : bounds[0];
    const minMax = label ? 1 : bounds[1];
    const stretchedBounds = [
      maxMin < bounds[0] ? maxMin : bounds[0],
      minMax > bounds[1] ? minMax : bounds[1],
    ];

    if (!label && !numeric) return false;

    const rangeIsFiltered =
      stretchedBounds.some(
        (b, i) => range[i] !== b && b !== null && range[i] !== null
      ) && bounds[0] !== bounds[1];

    if (numeric) return rangeIsFiltered || !none;

    return Boolean(include.length) || rangeIsFiltered || !none;
  },
});

export const labelConfidenceBounds = selectorFamily({
  key: "labelConfidenceBounds",
  get: (label) => ({ get }) => {
    const labels = get(atoms.datasetStats).labels;
    return labels && labels[label]
      ? labels[label].confidence_bounds
      : [null, null];
  },
});

export const numericFieldBounds = selectorFamily({
  key: "numericFieldBounds",
  get: (label) => ({ get }) => {
    const bounds = get(atoms.datasetStats).numeric_field_bounds;
    return bounds && bounds[label] ? bounds[label] : [null, null];
  },
});

export const labelNameGroups = selectorFamily({
  key: "labelNameGroups",
  get: (dimension: string) => ({ get }) =>
    makeLabelNameGroups(
      get(fields(dimension)),
      get(labelNames(dimension)),
      get(labelTypes(dimension))
    ),
});

export const isNumericField = selectorFamily({
  key: "isNumericField",
  get: (name) => ({ get }) => {
    return VALID_NUMERIC_TYPES.includes(get(fields("sample"))[name]);
  },
});

export const sampleModalFilter = selector({
  key: "sampleModalFilter",
  get: ({ get }) => {
    const filters = get(modalLabelFilters);
    const activeLabels = get(atoms.modalActiveLabels("sample"));
    return (sample) => {
      return Object.entries(sample).reduce((acc, [key, value]) => {
        if (key === "tags") {
          acc[key] = value;
        } else if (value && VALID_LIST_TYPES.includes(value._cls)) {
          acc[key] =
            filters[key] && value !== null
              ? {
                  ...value,
                  [value._cls.toLowerCase()]: value[
                    value._cls.toLowerCase()
                  ].filter(filters[key]),
                }
              : value;
        } else if (value !== null && filters[key] && filters[key](value)) {
          acc[key] = value;
        } else if (RESERVED_FIELDS.includes(key)) {
          acc[key] = value;
        } else if (
          ["string", "number", "null"].includes(typeof value) &&
          activeLabels[key]
        ) {
          acc[key] = value;
        }
        return acc;
      }, {});
    };
  },
});

import { selector, selectorFamily } from "recoil";
import * as atoms from "./atoms";
import { generateColorMap } from "../utils/colors";
import {
  RESERVED_FIELDS,
  VALID_LIST_TYPES,
  VALID_NUMERIC_TYPES,
  makeLabelNameGroups,
  labelTypeHasColor,
} from "../utils/labels";

export const datasetName = selector({
  key: "datasetName",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    return stateDescription.dataset ? stateDescription.dataset.name : null;
  },
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

export const framesLabelsCount = selector({
  key: "frameLabelsCount",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    return stateDescription.frame_labels ? stateDescription.frame_labels : null;
  },
});

export const datasetStats = selector({
  key: "datasetStats",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    return stateDescription.view_stats || {};
  },
});

export const extendedDatasetStats = selector({
  key: "extendedDatasetStats",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    return stateDescription.extended_view_stats || {};
  },
});

export const totalCount = selector({
  key: "totalCount",
  get: ({ get }): number => {
    return get(atoms.stateDescription).view_count;
  },
});

export const filterStage = selectorFamily({
  key: "filterStage",
  get: (fieldName: string) => ({ get }) => {
    const state = get(atoms.stateDescription);
    return state.filter_stages ? state.filter_stages[fieldName] : null;
  },
});

export const filteredCount = selector({
  key: "filteredCount",
  get: ({ get }): number => {
    return get(atoms.stateDescription).extended_view_count;
  },
});

export const tagNames = selector({
  key: "tagNames",
  get: ({ get }) => {
    return get(atoms.stateDescription).tags || [];
  },
});

export const tagSampleCounts = selector({
  key: "tagSampleCounts",
  get: ({ get }) => {
    return get(datasetStats).tags || {};
  },
});

export const filteredTagSampleCounts = selector({
  key: "filteredTagSampleCounts",
  get: ({ get }) => {
    return get(extendedDatasetStats).tags || {};
  },
});

export const fieldSchema = selector({
  key: "fieldSchema",
  get: ({ get }) => {
    return get(atoms.stateDescription).field_schema || {};
  },
});

export const labelNames = selector({
  key: "labelNames",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    const stats = get(datasetStats);
    if (!stateDescription.labels) {
      return [];
    }
    return stateDescription.labels.map((label) => label.field);
  },
});

export const labelTypes = selector({
  key: "labelTypes",
  get: ({ get }) => {
    const labels = get(atoms.stateDescription).labels || [];
    const names = get(labelNames);
    const types = {};
    for (const label of labels) {
      if (names.includes(label.field)) {
        types[label.field] = label.cls;
      }
    }
    return types;
  },
});

export const labelClasses = selectorFamily({
  key: "labelClasses",
  get: (label) => ({ get }) => {
    const stats = get(datasetStats);
    return stats.labels && stats.labels[label]
      ? stats.labels[label].classes
      : [];
  },
});

export const labelSampleCounts = selector({
  key: "labelSampleCounts",
  get: ({ get }) => {
    const fields = get(datasetStats).custom_fields || {};
    if (get(mediaType) === "video") {
      const frames = fields.frames || {};
      return {
        ...fields,
        ...frames,
      };
    }
    return fields;
  },
});

export const filteredLabelSampleCounts = selector({
  key: "filteredLabelSampleCounts",
  get: ({ get }) => {
    const fields = get(extendedDatasetStats).custom_fields || {};
    if (get(mediaType) === "video") {
      const frames = fields.frames || {};
      return {
        ...fields,
        ...frames,
      };
    }
    return fields;
  },
});

export const labelFilters = selector({
  key: "labelFilters",
  get: ({ get }) => {
    const labels = get(atoms.activeLabels);
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
    const labels = get(atoms.modalActiveLabels);
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
    const active = get(atoms.activeLabels);
    set(atoms.modalActiveLabels, active);
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
    const colorLabelNames = Object.entries(get(labelTypes))
      .filter(([name, type]) => labelTypeHasColor(type))
      .map(([name]) => name);
    set(
      atoms.colorMap,
      generateColorMap([...get(tagNames), ...colorLabelNames], colorMap)
    );
  },
});

export const isLabel = selectorFamily({
  key: "isLabel",
  get: (field) => ({ get }) => {
    const types = get(labelTypes);
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
    const labels = get(datasetStats).labels;
    return labels && labels[label]
      ? labels[label].confidence_bounds
      : [null, null];
  },
});

export const numericFieldBounds = selectorFamily({
  key: "numericFieldBounds",
  get: (label) => ({ get }) => {
    const bounds = get(datasetStats).numeric_field_bounds;
    return bounds && bounds[label] ? bounds[label] : [null, null];
  },
});

export const labelNameGroups = selector({
  key: "labelNameGroups",
  get: ({ get }) =>
    makeLabelNameGroups(get(fieldSchema), get(labelNames), get(labelTypes)),
});

export const isNumericField = selectorFamily({
  key: "isNumericField",
  get: (name) => ({ get }) => {
    return VALID_NUMERIC_TYPES.includes(get(fieldSchema)[name]);
  },
});

export const sampleModalFilter = selector({
  key: "sampleModalFilter",
  get: ({ get }) => {
    const filters = get(modalLabelFilters);
    const activeLabels = get(atoms.modalActiveLabels);
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

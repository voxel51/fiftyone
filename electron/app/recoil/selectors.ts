import { selector, selectorFamily } from "recoil";
import * as atoms from "./atoms";
import { generateColorMap } from "../utils/colors";
import {
  RESERVED_FIELDS,
  VALID_LIST_TYPES,
  VALID_NUMERIC_TYPES,
  makeLabelNameGroups,
} from "../utils/labels";

export const viewStages = selector({
  key: "viewStages",
  get: ({ get }) => {
    return get(atoms.stateDescription).viewStages;
  },
});

export const numViewStages = selector({
  key: "numStages",
  get: ({ get }) => {
    return get(viewStages).length;
  },
});

export const datasetName = selector({
  key: "datasetName",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    return stateDescription.dataset ? stateDescription.dataset.name : null;
  },
});

export const datasetStats = selector({
  key: "datasetStats",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    return stateDescription.view_stats ? stateDescription.view_stats : {};
  },
});

export const extendedDatasetStats = selector({
  key: "extendedDatasetStats",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    return stateDescription.extended_view_stats
      ? stateDescription.extended_view_stats
      : {};
  },
});

export const numSamples = selector({
  key: "numSamples",
  get: ({ get }) => {
    return get(atoms.stateDescription).count;
  },
});

export const tagNames = selector({
  key: "tagNames",
  get: ({ get }) => {
    const stateDescription = get(atoms.stateDescription);
    return stateDescription.tags || [];
  },
});

export const tagSampleCounts = selector({
  key: "tagSampleCounts",
  get: ({ get }) => {
    return get(atoms.stateDescription).view_stats.tags || {};
  },
});

export const filteredTagSampleCounts = selector({
  key: "filteredTagSampleCounts",
  get: ({ get }) => {
    return get(atoms.stateDescription).extended_view_stats.tags || {};
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
    return stateDescription.labels
      .map((label) => label._id.field)
      .filter((name) => stats.custom_fields.hasOwnProperty(name));
  },
});

export const labelTypes = selector({
  key: "labelTypes",
  get: ({ get }) => {
    const labels = get(atoms.stateDescription).labels || [];
    const names = get(labelNames);
    const types = {};
    for (const label of labels) {
      if (names.includes(label._id.field)) {
        types[label._id.field] = label._id.cls;
      }
    }
    return types;
  },
});

export const labelClasses = selectorFamily({
  key: "labelClasses",
  get: (label) => ({ get }) => {
    return get(atoms.stateDescription).view_stats.labels[label].classes;
  },
});

export const labelSampleCounts = selector({
  key: "labelSampleCounts",
  get: ({ get }) => {
    return get(datasetStats).custom_fields || {};
  },
});

export const filteredLabelSampleCounts = selector({
  key: "filteredLabelSampleCounts",
  get: ({ get }) => {
    return get(extendedDatasetStats).custom_fields || {};
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
      filters[label] = (s, useValue = false) => {
        const inRange =
          range.every((r) => r === null) ||
          (range[0] <= s.confidence && s.confidence <= range[1]);
        const noConfidence = none && s.confidence === undefined;
        const isIncluded =
          include.length === 0 ||
          include.includes(useValue ? s.value : s.label);
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
      filters[label] = (s, useValue = false) => {
        const inRange =
          range.every((r) => r === null) ||
          (range[0] <= s.confidence && s.confidence <= range[1]);
        const noConfidence = none && s.confidence === undefined;
        const isIncluded =
          include.length === 0 ||
          include.includes(useValue ? s.value : s.label);
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
    set(
      atoms.colorMap,
      generateColorMap([...get(tagNames), ...get(labelNames)], colorMap)
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

export const fieldIsFiltered = selectorFamily({
  key: "fieldIsFiltered",
  get: (field) => ({ get }) => {
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

    if (!label && !numeric) return false;

    const rangeIsFiltered = bounds.some(
      (b, i) => range[i] !== b && b !== null && range[i] !== null
    );

    if (numeric) return rangeIsFiltered || !none;

    return include.length || rangeIsFiltered || !none;
  },
});

export const labelConfidenceBounds = selectorFamily({
  key: "labelConfidenceBounds",
  get: (label) => ({ get }) => {
    return get(atoms.stateDescription).view_stats.labels[label]
      .confidence_bounds;
  },
});

export const numericFieldBounds = selectorFamily({
  key: "numericFieldBounds",
  get: (label) => ({ get }) => {
    const bounds = get(atoms.stateDescription).view_stats.numeric_field_bounds[
      label
    ];
    return bounds ? bounds : [null, null];
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
          acc[key] = value[value._cls.toLowerCase()].filter(filters[key]);
        } else if (value && filters[key] && filters[key](value)) {
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

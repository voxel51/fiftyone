import { atomFamily, selector, selectorFamily } from "recoil";

import { Range } from "./RangeSlider";
import {
  isBooleanField,
  isLabelField,
  isNumericField,
  isStringField,
} from "./utils";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";

const getRange = (
  get: GetRecoilValue,
  path: string,
  range: Range | DefaultValue
): Range => {
  const bounds = get(selectors.numericFieldBounds(path));
  return bounds; // todo;
};

export const modalFilterIncludeLabels = atomFamily<string[], string>({
  key: "modalFilterIncludeLabels",
  default: [],
});

export const modalFilterLabelConfidenceRange = atomFamily<Range, string>({
  key: "modalFilterLabelConfidenceRange",
  default: [null, null],
});

export const modalFilterLabelIncludeNoConfidence = atomFamily<boolean, string>({
  key: "modalFilterLabelIncludeNoConfidence",
  default: true,
});

export const confidenceRangeAtom = selectorFamily<Range, string>({
  key: "confidenceRangeAtom",
  get: ({ get }) => {},
  set: (path) => ({ get, set }, value) => {},
});

interface Label {
  confidence?: number;
  label?: number;
}

type LabelFilters = {
  [key: string]: (Label) => boolean;
};

export const labelFilters = selector<LabelFilters>({
  key: "labelFilters",
  get: ({ get }) => {
    const frameLabels = get(atoms.activeLabels("frame"));
    const labels = {
      ...get(atoms.activeLabels("sample")),
      ...Object.keys(frameLabels).reduce((acc, cur) => {
        return {
          ...acc,
          ["frames." + cur]: frameLabels[cur],
        };
      }, {}),
    };
    const filters = {};
    for (const label in labels) {
      const range = get(filterLabelConfidenceRange(label));
      const none = get(filterLabelIncludeNoConfidence(label));
      const include = get(filterIncludeLabels(label));
      filters[label] = (s) => {
        const inRange =
          range[0] - 0.005 <= s.confidence && s.confidence <= range[1] + 0.005;
        const noConfidence = none && s.confidence === undefined;
        const isIncluded = include.length === 0 || include.includes(s.label);
        return (inRange || noConfidence) && isIncluded;
      };
    }
    return filters;
  },
});

export const modalLabelFilters = selector<LabelFilters>({
  key: "modalLabelFilters",
  get: ({ get }) => {
    const frameLabels = get(atoms.modalActiveLabels("frame"));
    const labels = {
      ...get(atoms.modalActiveLabels("sample")),
      ...Object.keys(frameLabels).reduce((acc, cur) => {
        return {
          ...acc,
          ["frames." + cur]: frameLabels[cur],
        };
      }, {}),
    };
    const hiddenObjects = get(atoms.hiddenObjects);
    const filters = {};
    for (const label in labels) {
      const range = get(atoms.modalFilterLabelConfidenceRange(label));
      const none = get(atoms.modalFilterLabelIncludeNoConfidence(label));
      const include = get(atoms.modalFilterIncludeLabels(label));
      filters[label] = (s) => {
        if (hiddenObjects[s.id]) {
          return false;
        }
        const inRange =
          range[0] - 0.005 <= s.confidence && s.confidence <= range[1] + 0.005;
        const noConfidence = none && s.confidence === undefined;
        const isIncluded = include.length === 0 || include.includes(s.label);
        return labels[label] && (inRange || noConfidence) && isIncluded;
      };
    }
    return filters;
  },
  set: ({ get, set }, _) => {
    const paths = get(labelPaths);
    const activeLabels = get(atoms.activeLabels("sample"));
    set(atoms.modalActiveLabels("sample"), activeLabels);
    const activeFrameLabels = get(atoms.activeLabels("frame"));
    set(atoms.modalActiveLabels("frame"), activeFrameLabels);
    for (const label of paths) {
      set(
        modalFilterLabelConfidenceRange(label),
        get(filterLabelConfidenceRange(label))
      );

      set(
        atoms.modalFilterLabelIncludeNoConfidence(label),
        get(filterLabelIncludeNoConfidence(label))
      );

      set(
        atoms.modalFilterIncludeLabels(label),
        get(filterIncludeLabels(label))
      );

      set(atoms.modalColorByLabel, get(atoms.colorByLabel));
    }
  },
});

export const sampleModalFilter = selector({
  key: "sampleModalFilter",
  get: ({ get }) => {
    const filters = get(modalLabelFilters);
    const frameLabels = get(atoms.modalActiveLabels("frame"));
    const activeLabels = {
      ...get(atoms.modalActiveLabels("sample")),
      ...Object.keys(frameLabels).reduce((acc, cur) => {
        return {
          ...acc,
          ["frames." + cur]: frameLabels[cur],
        };
      }, {}),
    };
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

export const modalFieldIsFiltered = selectorFamily({
  key: "modalFieldIsFiltered",
  get: (field: string) => ({ get }): boolean => {
    const label = get(isLabelField(field));

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
    const string = get(isStringField(field));
    if (string) {
      return (
        !get(filterStringFieldIncludeNone(field)) ||
        get(filterStringFieldValues(field)).length > 0
      );
    }
    const range = get(
      label ? filterLabelConfidenceRange(field) : filterNumericFieldRange(field)
    );
    const bounds = get(
      label ? labelConfidenceBounds(field) : numericFieldBounds(field)
    );
    const none = get(
      label
        ? filterLabelIncludeNoConfidence(field)
        : filterNumericFieldIncludeNone(field)
    );
    const include = get(filterIncludeLabels(field));
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

const meetsDefault = (filter: object, path?: string) => {
  const none = filter.none === true;
  switch (filter._type) {
    case "bool":
      return filter.true === true && filter.false === false && none;
    default:
      throw Error("No Type");
  }
};

const filterDefaults = (filter, path = "") => {
  Object.keys(filter).forEach((key) => {
    if (filter[key]._type && !meetsDefault(filter[key], path)) {
      delete filter[key];
    } else {
      filterDefaults(filter[key], path.length ? `${path}.${key}` : key);
    }
  });
};

export const updateFilter = (filter, path, args) => {
  const keys = path.split(".");
  let o = filter;
  keys.array.forEach((key, idx) => {
    !o[key] && (o[key] = {});
    idx !== keys.length - 1 && (o = o[key]);
    idx === keys.length - 1 && (o[key] = args);
  });

  return filterDefaults(filter);
};

export const GLOBAL_ATOMS = {
  colorByLabel: atoms.colorByLabel,
  includeLabels: selectors.filterIncludeLabels,
  includeNoLabel: selectors.filterIncludeNoLabel,
  includeNoConfidence: selectors.filterLabelIncludeNoConfidence,
  confidenceRange: selectors.filterLabelConfidenceRange,
  confidenceBounds: selectors.labelConfidenceBounds,
  fieldIsFiltered: selectors.fieldIsFiltered,
};

export const MODAL_ATOMS = {
  colorByLabel: atoms.modalColorByLabel,
  includeLabels: atoms.modalFilterIncludeLabels,
  includeNoLabel: selectors.modalFilterIncludeNoLabel,
  includeNoConfidence: atoms.modalFilterLabelIncludeNoConfidence,
  confidenceRange: atoms.modalFilterLabelConfidenceRange,
  confidenceBounds: selectors.labelConfidenceBounds,
  fieldIsFiltered: selectors.modalFieldIsFiltered,
};

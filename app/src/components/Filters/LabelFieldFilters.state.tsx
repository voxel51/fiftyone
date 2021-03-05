import { atomFamily, selector, selectorFamily } from "recoil";

import { Range } from "./RangeSlider";
import {
  activeFields,
  isBooleanField,
  isNumericField,
  isStringField,
} from "./utils";
import * as booleanField from "./BooleanFieldFilter";
import * as numericField from "./NumericFieldFilter";
import * as stringField from "./StringFieldFilter";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { RESERVED_FIELDS, VALID_LIST_TYPES } from "../../utils/labels";

const COUNT_CLS = "Count";

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

interface Label {
  confidence?: number;
  label?: number;
}

type LabelFilters = {
  [key: string]: (label: Label) => boolean;
};

export const getPathExtension = (type: string): string => {
  if (VALID_LIST_TYPES.includes(type)) {
    return `.${type.toLocaleLowerCase()}`;
  }
  return "";
};

export const labelFilters = selectorFamily<LabelFilters, boolean>({
  key: "labelFilters",
  get: (modal) => ({ get }) => {
    const labels = get(activeFields(true));
    const filters = {};
    const typeMap = get(selectors.labelTypesMap);
    const hiddenObjects = modal ? get(atoms.hiddenObjects) : null;
    for (const label of labels) {
      const path = `${label}${getPathExtension(typeMap[label])}`;

      const [cRangeAtom, cNoneAtom, lValuesAtom, lExcludeAtom] = modal
        ? [
            numericField.rangeModalAtom,
            numericField.noneModalAtom,
            stringField.selectedValuesModalAtom,
            stringField.excludeModalAtom,
          ]
        : [
            numericField.rangeAtom,
            numericField.noneAtom,
            stringField.selectedValuesAtom,
            stringField.excludeAtom,
          ];

      const cPath = `${path}.confidence`;
      const lPath = `${path}.label`;

      const [cRange, cNone, lValues, lExclude] = [
        get(cRangeAtom({ path: cPath, defaultRange: [0, 1] })),
        get(cNoneAtom({ path: cPath, defaultRange: [0, 1] })),
        get(lValuesAtom(lPath)),
        get(lExcludeAtom(lPath)),
      ];

      filters[label] = (s) => {
        if (hiddenObjects && hiddenObjects[s.id ?? s._id]) {
          return false;
        }
        const inRange =
          cRange[0] - 0.005 <= s.confidence &&
          s.confidence <= cRange[1] + 0.005;
        const noConfidence = cNone && s.confidence === undefined;
        let label = s.label ? s.label : s.value;
        if (label === undefined) {
          label = null;
        }
        let included = lValues.includes(label);
        if (lExclude) {
          included = !included;
        }
        return (inRange || noConfidence) && (included || lValues.length === 0);
      };
    }
    return filters;
  },
  set: () => ({ get, set }, _) => {
    const paths = get(selectors.labelTypesMap);
    set(activeFields(true), get(activeFields(false)));
    for (const [label, type] of Object.entries(paths)) {
      const path = `${label}${getPathExtension(type)}`;
      const cPath = `${path}.confidence`;
      const lPath = `${path}.label`;
      set(
        numericField.rangeModalAtom({ path: cPath, defaultRange: [0, 1] }),
        get(numericField.rangeAtom({ path: cPath, defaultRange: [0, 1] }))
      );

      set(
        numericField.noneModalAtom({ path: cPath, defaultRange: [0, 1] }),
        get(numericField.noneModalAtom({ path: cPath, defaultRange: [0, 1] }))
      );

      set(
        stringField.selectedValuesModalAtom(lPath),
        get(stringField.selectedValuesAtom(lPath))
      );

      set(
        stringField.excludeModalAtom(lPath),
        get(stringField.excludeAtom(lPath))
      );

      set(atoms.colorByLabel(true), get(atoms.colorByLabel(false)));
      set(atoms.colorSeed(true), get(atoms.colorSeed(false)));
    }
  },
});

export const sampleModalFilter = selector({
  key: "sampleModalFilter",
  get: ({ get }) => {
    const filters = get(labelFilters(true));

    const labels = get(activeFields(true));
    const hiddenObjects = get(atoms.hiddenObjects);
    const fields = get(activeFields(false));
    return (sample, prefix = null) => {
      return Object.entries(sample).reduce((acc, [key, value]) => {
        if (value && hiddenObjects[value.id ?? value._id]) {
          return acc;
        }
        if (prefix) {
          key = `${prefix}${key}`;
        }
        if (key === "tags") {
          acc[key] = value;
        } else if (value && VALID_LIST_TYPES.includes(value._cls)) {
          if (fields.includes(key)) {
            acc[key] =
              filters[key] && value !== null
                ? {
                    ...value,
                    [value._cls.toLowerCase()]: value[
                      value._cls.toLowerCase()
                    ].filter(
                      (l) => filters[key](l) && !hiddenObjects[l.id ?? l._id]
                    ),
                  }
                : value;
          }
        } else if (value !== null && filters[key] && filters[key](value)) {
          acc[key] = value;
        } else if (RESERVED_FIELDS.includes(key)) {
          acc[key] = value;
        } else if (
          ["string", "number", "null"].includes(typeof value) &&
          labels.includes(key)
        ) {
          acc[key] = value;
        }
        return acc;
      }, {});
    };
  },
});

export const fieldIsFiltered = selectorFamily<
  boolean,
  { path: string; modal: boolean }
>({
  key: "fieldIsFiltered",
  get: ({ path, modal }) => ({ get }) => {
    const isArgs = { path, modal };
    if (get(isBooleanField(path))) {
      return get(booleanField.fieldIsFiltered(isArgs));
    } else if (get(isNumericField(path))) {
      return get(numericField.fieldIsFiltered(isArgs));
    } else if (get(isStringField(path))) {
      return get(stringField.fieldIsFiltered(isArgs));
    }

    path = `${path}${getPathExtension(get(selectors.labelTypesMap)[path])}`;
    const cPath = `${path}.confidence`;
    const lPath = `${path}.label`;

    return (
      get(
        numericField.fieldIsFiltered({
          ...isArgs,
          path: cPath,
          defaultRange: [0, 1],
        })
      ) || get(stringField.fieldIsFiltered({ ...isArgs, path: lPath }))
    );
  },
});

const catchLabelCount = (
  names: string[],
  prefix: string,
  cur: { name: string; _CLS: string; result: number },
  acc: { [key: string]: number }
): void => {
  if (
    cur.name &&
    names.includes(cur.name.slice(prefix.length).split(".")[0]) &&
    cur._CLS === COUNT_CLS
  ) {
    acc[cur.name.slice(prefix.length).split(".")[0]] = cur.result;
  }
};

interface Counts {
  [key: string]: number | null;
}

export const labelSampleCounts = selectorFamily<Counts | null, string>({
  key: "labelSampleCounts",
  get: (dimension) => ({ get }) => {
    const names = get(selectors.labelNames(dimension)).concat(
      get(selectors.scalarNames(dimension))
    );
    const prefix = dimension === "sample" ? "" : "frames.";
    const stats = get(selectors.datasetStats);
    if (stats === null) {
      return null;
    }
    return stats.reduce((acc, cur) => {
      catchLabelCount(names, prefix, cur, acc);
      return acc;
    }, {});
  },
});

export const filteredLabelSampleCounts = selectorFamily<Counts | null, string>({
  key: "filteredLabelSampleCounts",
  get: (dimension) => ({ get }) => {
    const names = get(selectors.labelNames(dimension)).concat(
      get(selectors.scalarNames(dimension))
    );
    const prefix = dimension === "sample" ? "" : "frames.";
    const stats = get(selectors.extendedDatasetStats);
    if (stats === null) {
      return null;
    }
    return stats.reduce((acc, cur) => {
      catchLabelCount(names, prefix, cur, acc);
      return acc;
    }, {});
  },
});

export const labelSampleModalCounts = selectorFamily<Counts | null, string>({
  key: "labelSampleModalCounts",
  get: (dimension) => ({ get }) => {
    const labels = get(selectors.labelNames(dimension));
    const types = get(selectors.labelTypesMap);
    const sample = get(atoms.modal).sample || {};
    const frameData = get(atoms.sampleFrameData(sample._id));

    if (dimension === "frame") {
      return labels.reduce((acc, path) => {
        if (!(path in acc)) acc[path] = 0;
        if (!Boolean(frameData)) return acc;
        for (const frame of frameData) {
          acc[path] += sampleCountResolver(
            frame[path],
            types["frames." + path]
          );
        }
        return acc;
      }, {});
    }
    return labels.reduce((acc, path) => {
      if (!(path in acc)) acc[path] = 0;
      acc[path] += sampleCountResolver(sample[path], types[path]);
      return acc;
    }, {});
  },
});

const sampleCountResolver = (value, type) => {
  if (!value) return 0;
  return ["Detections", "Classifications", "Polylines"].includes(type)
    ? value[type.toLowerCase()].length
    : type === "Keypoints"
    ? value.keypoints.reduce((acc, cur) => acc + cur.points.length, 0)
    : type === "Keypoint"
    ? value.points.length
    : 1;
};

export const filteredLabelSampleModalCounts = selectorFamily<
  Counts | null,
  string
>({
  key: "filteredLabelSampleModalCounts",
  get: (dimension) => ({ get }) => {
    const labels = get(selectors.labelNames(dimension));
    const types = get(selectors.labelTypesMap);
    const filter = get(sampleModalFilter);
    const sample = filter(get(atoms.modal).sample || {});
    const frameData = get(atoms.sampleFrameData(sample._id));
    if (dimension === "frame") {
      return labels.reduce((acc, path) => {
        if (!(path in acc)) acc[path] = 0;
        if (!Boolean(frameData)) return acc;
        for (const frame of frameData) {
          const filtered = filter(frame, "frames.");
          acc[path] += sampleCountResolver(
            filtered["frames." + path],
            types["frames." + path]
          );
        }
        return acc;
      }, {});
    }

    return labels.reduce((acc, path) => {
      if (!(path in acc)) acc[path] = 0;
      acc[path] += sampleCountResolver(sample[path], types[path]);
      return acc;
    }, {});
  },
});

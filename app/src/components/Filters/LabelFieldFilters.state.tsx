import { atomFamily, selector, selectorFamily } from "recoil";

import { Range } from "./RangeSlider";
import {
  activeFields,
  activeLabels,
  isBooleanField,
  isNumericField,
  isStringField,
} from "./utils";
import * as booleanField from "./BooleanFieldFilter";
import * as numericField from "./NumericFieldFilter";
import * as stringField from "./StringFieldFilter";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import {
  LABEL_LIST,
  RESERVED_FIELDS,
  VALID_LIST_TYPES,
} from "../../utils/labels";

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
    return `.${LABEL_LIST[type]}`;
  }
  return "";
};

export const labelFilters = selectorFamily<LabelFilters, boolean>({
  key: "labelFilters",
  get: (modal) => ({ get }) => {
    const labels = get(activeFields(true));
    const filters = {};
    const typeMap = get(selectors.labelTypesMap);
    const hiddenLabels = modal ? get(atoms.hiddenLabels) : null;
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

      const matchedTags = get(selectors.matchedTags({ key: "label", modal }));

      filters[label] = (s) => {
        if (hiddenLabels && hiddenLabels[s.id ?? s._id]) {
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

        const meetsTags =
          matchedTags.size == 0 ||
          (s.tags && s.tags.some((t) => matchedTags.has(t)));

        return (
          (inRange || noConfidence) &&
          (included || lValues.length === 0) &&
          meetsTags
        );
      };
    }
    return filters;
  },
  set: () => ({ get, set }, _) => {
    const paths = get(selectors.labelTypesMap);
    set(
      activeFields(true),
      get(activeFields(false)).filter(
        (f) => !f.startsWith("tags.") && !f.startsWith("_label_tags.")
      )
    );
    for (const [label, type] of Object.entries(paths)) {
      const path = `${label}${getPathExtension(type)}`;
      const cPath = `${path}.confidence`;
      const lPath = `${path}.label`;
      set(
        selectors.matchedTags({ modal: true, key: "sample" }),
        get(selectors.matchedTags({ modal: false, key: "sample" }))
      );

      set(
        selectors.matchedTags({ modal: true, key: "label" }),
        get(selectors.matchedTags({ modal: false, key: "label" }))
      );

      set(
        numericField.rangeModalAtom({ path: cPath, defaultRange: [0, 1] }),
        get(numericField.rangeAtom({ path: cPath, defaultRange: [0, 1] }))
      );

      set(
        numericField.noneModalAtom({ path: cPath, defaultRange: [0, 1] }),
        get(numericField.noneAtom({ path: cPath, defaultRange: [0, 1] }))
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
    const hiddenLabels = get(atoms.hiddenLabels);
    const fields = get(activeFields(false));
    return (sample, prefix = null) => {
      return Object.entries(sample).reduce((acc, [key, value]) => {
        if (value && hiddenLabels[value.id ?? value._id]) {
          return acc;
        }
        if (prefix) {
          key = `${prefix}${key}`;
        }
        if (key === "tags") {
          acc[key] = value;
        } else if (
          value &&
          VALID_LIST_TYPES.includes(value._cls) &&
          labels.includes(key)
        ) {
          if (fields.includes(key)) {
            acc[key] =
              filters[key] && value !== null
                ? {
                    ...value,
                    [value._cls.toLowerCase()]: value[
                      value._cls.toLowerCase()
                    ].filter(
                      (l) => filters[key](l) && !hiddenLabels[l.id ?? l._id]
                    ),
                  }
                : value;
          }
        } else if (
          value !== null &&
          filters[key] &&
          filters[key](value) &&
          labels.includes(key)
        ) {
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
    if (path.startsWith("_label_tags.")) {
      return get(selectors.matchedTags({ modal, key: "label" })).has(
        path.slice("_label_tags.".length)
      );
    }

    if (path.startsWith("tags.")) {
      return get(selectors.matchedTags({ modal, key: "sample" })).has(
        path.slice("tags.".length)
      );
    }

    path = `${path}${getPathExtension(get(selectors.labelTypesMap)[path])}`;
    const cPath = `${path}.confidence`;
    const lPath = `${path}.label`;
    const hasHiddenLabels = modal
      ? get(selectors.hiddenFieldLabels(path.split(".")[0])).length > 0
      : false;

    return (
      get(
        numericField.fieldIsFiltered({
          ...isArgs,
          path: cPath,
          defaultRange: [0, 1],
        })
      ) ||
      get(stringField.fieldIsFiltered({ ...isArgs, path: lPath })) ||
      hasHiddenLabels
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
    const sample = get(selectors.modalSample) || {};
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
      if (!(path in acc)) acc[path] = null;
      acc[path] += sampleCountResolver(sample[path], types[path]);
      return acc;
    }, {});
  },
});

const sampleCountResolver = (value, type) => {
  if (!value) return 0;

  if (VALID_LIST_TYPES.includes(type)) {
    const values = value[LABEL_LIST[type]];
    if (!values?.length) {
      return 0;
    }

    if (type === "Keypoints") {
      return values.reduce((acc, cur) => acc + cur?.points?.length || 0, 0);
    }

    return values.length;
  } else if (type === "Keypoint") {
    return value?.points?.length || 0;
  }
  return 1;
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
    const sample = filter(get(selectors.modalSample) || {});
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
      const result = sampleCountResolver(sample[path], types[path]);
      if (result > 0) {
        acc[path] = !acc[path] ? 0 : acc[path];
        acc[path] += result;
      }
      return acc;
    }, {});
  },
});

export const labelCount = selectorFamily<number | null, boolean>({
  key: "labelCount",
  get: (modal) => ({ get }) => {
    const labels = get(activeLabels({ modal, frames: false }));
    const frameLabels = get(activeLabels({ modal, frames: true }));
    const hasFilters = Object.keys(get(selectors.filterStages)).length > 0;

    const [counts, frameCounts] = modal
      ? [
          get(filteredLabelSampleModalCounts("sample")),
          get(filteredLabelSampleModalCounts("frame")),
        ]
      : [
          get(
            hasFilters
              ? filteredLabelSampleCounts("sample")
              : labelSampleCounts("sample")
          ),
          get(
            hasFilters
              ? filteredLabelSampleCounts("frame")
              : labelSampleCounts("frame")
          ),
        ];

    let sum = 0;

    if (!counts || !frameCounts) {
      return null;
    }
    labels.forEach((l) => {
      if (!counts[l]) return;
      sum += counts[l];
    });

    frameLabels
      .map((l) => l.slice("frames.".length))
      .forEach((l) => {
        if (!frameCounts[l]) return;
        sum += frameCounts[l];
      });

    return sum;
  },
});

const addLabels = ({ activeFields, filter, labels, sample, obj }) => {
  Object.entries(filter(obj))
    .filter(([k]) => !RESERVED_FIELDS.includes(k) && activeFields.includes(k))
    .forEach(([name, field]) => {
      if (VALID_LIST_TYPES.includes(field._cls)) {
        field[LABEL_LIST[field._cls]].forEach(({ _id }) => {
          labels.push({
            label_id: _id,
            sample_id: sample._id,
            field: name,
            frame_number: obj.frame_number || null,
          });
        });
      } else {
        labels.push({
          label_id: field._id,
          sample_id: sample._id,
          field: name,
          frame_number: obj.frame_number || null,
        });
      }
    });
};

export const modalLabels = selector<atoms.SelectedLabel[]>({
  key: "modalLabels",
  get: ({ get }) => {
    const sample = get(selectors.modalSample);
    const filter = get(sampleModalFilter);
    const activeFields = get(activeLabels({ modal: true, frames: false }));
    const isVideo = get(selectors.isVideoDataset);
    const labels = [];
    addLabels({ activeFields, filter, labels, sample, obj: sample });
    if (isVideo) {
      const activeFrameLabels = get(
        activeLabels({ modal: true, frames: true })
      );
      const frames = get(atoms.sampleFrameData(sample._id));
      frames &&
        frames.forEach((frame) =>
          addLabels({
            activeFields: activeFrameLabels,
            labels,
            sample,
            obj: frame,
            filter: (o) => filter(o, "frames."),
          })
        );
    }
    return labels;
  },
});

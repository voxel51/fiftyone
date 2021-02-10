import { atomFamily, selector, selectorFamily } from "recoil";

import { Range } from "./RangeSlider";
import { isBooleanField, isNumericField, isStringField } from "./utils";
import * as booleanField from "./BooleanFieldFilter";
import * as numericField from "./NumericFieldFilter";
import * as stringField from "./StringFieldFilter";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { RESERVED_FIELDS, VALID_LIST_TYPES } from "../../utils/labels";

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
    const activeLabels = modal ? atoms.modalActiveLabels : atoms.activeLabels;
    const frameLabels = activeLabels("frame");
    const labels = {
      ...get(activeLabels("sample")),
      ...Object.keys(get(frameLabels)).reduce((acc, cur) => {
        return {
          ...acc,
          ["frames." + cur]: frameLabels[cur],
        };
      }, {}),
    };
    const filters = {};
    const typeMap = get(selectors.labelTypesMap);
    for (const label in labels) {
      const path = `${label}${getPathExtension(typeMap[label])}`;

      const [cRangeAtom, cNoneAtom, lValuesAtom, lNoneAtom] = modal
        ? [
            numericField.rangeModalAtom,
            numericField.noneModalAtom,
            stringField.selectedValuesModalAtom,
            stringField.noneModalAtom,
          ]
        : [
            numericField.rangeAtom,
            numericField.noneAtom,
            stringField.selectedValuesAtom,
            stringField.noneAtom,
          ];

      const cPath = `${path}.confidence`;
      const lPath = `${path}.label`;

      const [cRange, cNone, lValues, lNone] = [
        get(cRangeAtom({ path: cPath, defaultRange: [0, 1] })),
        get(cNoneAtom(cPath)),
        get(lValuesAtom(lPath)),
        get(lNoneAtom(lPath)),
      ];

      filters[label] = (s) => {
        const inRange =
          cRange[0] - 0.005 <= s.confidence &&
          s.confidence <= cRange[1] + 0.005;
        const noConfidence = cNone && s.confidence === undefined;
        const label = s.label ? s.label : s.value;
        const isIncluded = lValues.length === 0 || lValues.includes(label);
        const noLabel = lNone && s.label === undefined;
        return (inRange || noConfidence) && (isIncluded || noLabel);
      };
    }
    return filters;
  },
  set: () => ({ get, set }, _) => {
    const paths = get(selectors.labelTypesMap);
    const activeLabels = get(atoms.activeLabels("sample"));
    set(atoms.modalActiveLabels("sample"), activeLabels);
    const activeFrameLabels = get(atoms.activeLabels("frame"));
    set(atoms.modalActiveLabels("frame"), activeFrameLabels);
    for (const [label, type] of Object.entries(paths)) {
      const path = `${label}${getPathExtension(type)}`;
      const cPath = `${path}.confidence`;
      const lPath = `${path}.label`;
      set(
        numericField.rangeModalAtom({ path: cPath, defaultRange: [0, 1] }),
        get(numericField.rangeAtom({ path: cPath, defaultRange: [0, 1] }))
      );

      set(
        numericField.noneModalAtom(cPath),
        get(numericField.noneModalAtom(cPath))
      );

      set(
        stringField.selectedValuesModalAtom(lPath),
        get(stringField.selectedValuesAtom(lPath))
      );

      set(stringField.noneModalAtom(lPath), get(stringField.noneAtom(lPath)));

      set(atoms.modalColorByLabel, get(atoms.colorByLabel));
    }
  },
});

export const sampleModalFilter = selector({
  key: "sampleModalFilter",
  get: ({ get }) => {
    const filters = get(labelFilters(true));
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

export const modalFieldIsFiltered = selectorFamily<boolean, string>({
  key: "modalFieldIsFiltered",
  get: (path) => ({ get }) => {
    const isArgs = { path, modal: true };
    if (get(isBooleanField(path))) {
      return booleanField.fieldIsFiltered(isArgs);
    } else if (get(isNumericField(path))) {
      return numericField.fieldIsFiltered(isArgs);
    } else if (get(isStringField(path))) {
      return stringField.fieldIsFiltered(isArgs);
    }

    path = `${path}${getPathExtension(path)}`;
    const cPath = `${path}.confidence`;
    const lPath = `${path}.label`;

    return (
      get(
        numericField.fieldIsFiltered({
          path: cPath,
          defaultRange: [0, 1],
          modal: true,
        })
      ) || get(stringField.fieldIsFiltered({ path: lPath, modal: true }))
    );
  },
});

export const fieldIsFiltered = selectorFamily<boolean, string>({
  key: "fieldIsFiltered",
  get: (path) => ({ get }) => {
    if (get(isBooleanField(path))) {
      return booleanField.fieldIsFiltered({ path });
    } else if (get(isNumericField(path))) {
      return numericField.fieldIsFiltered({ path });
    } else if (get(isStringField(path))) {
      return stringField.fieldIsFiltered({ path });
    }

    const type = get(selectors.labelTypesMap)[path];

    path = `${path}${getPathExtension(type)}`;
    const cPath = `${path}.confidence`;
    const lPath = `${path}.label`;

    return (
      get(
        numericField.fieldIsFiltered({ path: cPath, defaultRange: [0, 1] })
      ) || get(stringField.fieldIsFiltered({ path: lPath }))
    );
  },
});

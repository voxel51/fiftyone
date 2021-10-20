import { selector, selectorFamily } from "recoil";

import * as utils from "./utils";
import * as booleanField from "./BooleanFieldFilter.state";
import * as numericField from "./NumericFieldFilter.state";
import * as stringField from "./StringFieldFilter.state";
import * as atoms from "../../recoil/atoms";
import * as filterAtoms from "./atoms";
import * as selectors from "../../recoil/selectors";
import {
  LABEL_LIST,
  RESERVED_FIELDS,
  VALID_LIST_TYPES,
} from "../../utils/labels";

interface Label {
  confidence?: number;
  label?: number;
}

export type LabelFilters = {
  [key: string]: (
    label: Label
  ) => boolean | ((value: string | number | boolean) => boolean);
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
    const labels = get(modal ? utils.activeModalFields : utils.activeFields);
    const filters = {};
    const typeMap = get(selectors.labelTypesMap);
    const hiddenLabels = modal ? get(atoms.hiddenLabels) : null;

    const primitives = get(selectors.primitiveNames("sample"));
    for (const field of labels) {
      if (primitives.includes(field)) {
        if (get(numericField.isNumericField(field))) {
          const [range, none, inf, ninf, nan] = [
            get(numericField.rangeAtom({ modal, path: field })),
            get(numericField.otherAtom({ modal, path: field, key: "none" })),
            get(numericField.otherAtom({ modal, path: field, key: "inf" })),
            get(numericField.otherAtom({ modal, path: field, key: "ninf" })),
            get(numericField.otherAtom({ modal, path: field, key: "nan" })),
          ];
          filters[field] = (value) => {
            const inRange =
              range[0] - 0.005 <= value && value <= range[1] + 0.005;
            const noNone = none && value === undefined;
            return (
              inRange ||
              noNone ||
              (inf && value === "inf") ||
              (nan && value === "nan") ||
              (ninf && value === "-inf")
            );
          };
        } else if (get(stringField.isStringField(field))) {
          const [values, exclude] = [
            get(stringField.selectedValuesAtom({ modal, path: field })),
            get(stringField.excludeAtom({ modal, path: field })),
          ];

          filters[field] = (value) => {
            let included = values.includes(value);
            if (exclude) {
              included = !included;
            }

            return included || values.length === 0;
          };
        } else if (get(booleanField.isBooleanField(field))) {
          const [trueValue, falseValue, noneValue] = [
            get(booleanField.trueAtom({ modal, path: field })),
            get(booleanField.falseAtom({ modal, path: field })),
            get(booleanField.noneAtom({ modal, path: field })),
          ];

          if (!trueValue && !falseValue && !noneValue) {
            filters[field] = (value) => true;
          } else {
            filters[field] = (value) => {
              if (value === true && trueValue) {
                return true;
              }

              if (value === false && falseValue) {
                return true;
              }

              if (value === null && noneValue) {
                return true;
              }

              return false;
            };
          }
        }
        continue;
      }

      const path = `${field}${getPathExtension(typeMap[field])}`;

      const cPath = `${path}.confidence`;
      const lPath = `${path}.label`;

      const [cRange, cNone, cInf, cNinf, cNan, lValues, lExclude] = [
        get(
          numericField.rangeAtom({ modal, path: cPath, defaultRange: [0, 1] })
        ),
        get(
          numericField.otherAtom({
            modal,
            path: cPath,
            defaultRange: [0, 1],
            key: "none",
          })
        ),
        get(
          numericField.otherAtom({
            modal,
            path: cPath,
            defaultRange: [0, 1],
            key: "inf",
          })
        ),
        get(
          numericField.otherAtom({
            modal,
            path: cPath,
            defaultRange: [0, 1],
            key: "ninf",
          })
        ),
        get(
          numericField.otherAtom({
            modal,
            path: cPath,
            defaultRange: [0, 1],
            key: "nan",
          })
        ),
        get(stringField.selectedValuesAtom({ modal, path: lPath })),
        get(stringField.excludeAtom({ modal, path: lPath })),
      ];

      const matchedTags = get(filterAtoms.matchedTags({ key: "label", modal }));

      filters[field] = (s) => {
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
          (inRange ||
            noConfidence ||
            (cNan && s.confidence === "nan") ||
            (cInf && s.confidence === "inf") ||
            (cNinf && s.confidence === "-inf")) &&
          (included || lValues.length === 0) &&
          meetsTags
        );
      };
    }
    return filters;
  },
  set: () => ({ get, set }, _) => {
    set(utils.activeModalFields, get(utils.activeFields));
    set(atoms.cropToContent(true), get(atoms.cropToContent(false)));
    set(filterAtoms.modalFilterStages, get(filterAtoms.filterStages));
    set(atoms.colorByLabel(true), get(atoms.colorByLabel(false)));
    set(atoms.colorSeed(true), get(atoms.colorSeed(false)));
    set(atoms.sortFilterResults(true), get(atoms.sortFilterResults(false)));
    set(atoms.alpha(true), get(atoms.alpha(false)));
  },
});
3;

export const fieldIsFiltered = selectorFamily<
  boolean,
  { path: string; modal: boolean }
>({
  key: "fieldIsFiltered",
  get: ({ path, modal }) => ({ get }) => {
    const isArgs = { path, modal };
    if (get(booleanField.isBooleanField(path))) {
      return get(booleanField.fieldIsFiltered(isArgs));
    } else if (get(numericField.isNumericField(path))) {
      return get(numericField.fieldIsFiltered(isArgs));
    } else if (get(stringField.isStringField(path))) {
      return get(stringField.fieldIsFiltered(isArgs));
    }
    if (path.startsWith("_label_tags.")) {
      return get(filterAtoms.matchedTags({ modal, key: "label" })).has(
        path.slice("_label_tags.".length)
      );
    }

    if (path.startsWith("tags.")) {
      return get(filterAtoms.matchedTags({ modal, key: "sample" })).has(
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

export const isLabelField = selectorFamily<boolean, string>({
  key: "isLabelField",
  get: (field) => ({ get }) => {
    const names = get(selectors.labelNames("sample")).concat(
      get(selectors.labelNames("frame")).map((l) => "frames." + l)
    );
    return names.includes(field);
  },
});

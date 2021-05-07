import { selectorFamily } from "recoil";

import * as booleanFiltering from "./BooleanFieldFilter";
import * as labelFiltering from "./LabelFieldFilters.state";
import * as numericFiltering from "./NumericFieldFilter";
import * as stringFiltering from "./StringFieldFilter";
import { isBooleanField, isNumericField, isStringField } from "./utils";
import * as selectors from "../../recoil/selectors";

export const filteredScalars = selectorFamily<string[], boolean>({
  key: "filteredScalars",
  get: (modal) => ({ get }) => {
    const scalars = get(selectors.scalarNames("sample"));

    let filtered = [];
    scalars.forEach((path) => {
      if (get(isBooleanField(path))) {
        get(booleanFiltering.fieldIsFiltered({ modal, path })) &&
          filtered.push(path);
      } else if (get(isNumericField(path))) {
        get(numericFiltering.fieldIsFiltered({ modal, path })) &&
          filtered.push(path);
      } else if (get(isStringField(path))) {
        get(stringFiltering.fieldIsFiltered({ modal, path })) &&
          filtered.push(path);
      }
    });

    return filtered;
  },
  set: (modal) => ({ get, set }, newValue) => {
    const current = get(filteredScalars(modal));

    let paths = [];
    if (Array.isArray(newValue)) {
      paths = newValue;
    }

    current.forEach((path) => {
      if (paths.includes(path)) {
        return;
      }
      if (get(isBooleanField(path))) {
        const [none, trueValue, falseValue] = modal
          ? [
              booleanFiltering.noneModalAtom,
              booleanFiltering.trueModalAtom,
              booleanFiltering.falseModalAtom,
            ]
          : [
              booleanFiltering.noneAtom,
              booleanFiltering.trueAtom,
              booleanFiltering.falseAtom,
            ];

        set(none(path), false);
        set(trueValue(path), false);
        set(falseValue(path), false);
      } else if (get(isNumericField(path))) {
        const [noneValue, rangeValue] = modal
          ? [numericFiltering.noneModalAtom, numericFiltering.rangeModalAtom]
          : [numericFiltering.noneAtom, numericFiltering.rangeAtom];

        set(noneValue({ path }), true);
        set(rangeValue({ path }), get(numericFiltering.boundsAtom({ path })));
      } else if (get(isStringField(path))) {
        const values = modal
          ? stringFiltering.selectedValuesModalAtom
          : stringFiltering.selectedValuesAtom;
        const exclude = modal
          ? stringFiltering.excludeModalAtom
          : stringFiltering.excludeAtom;

        set(values(path), []);
        set(exclude(path), false);
      }
    });
  },
});

export const numFilteredScalars = selectorFamily<number, boolean>({
  key: "numFilteredScalars",
  get: (modal) => ({ get }) => get(filteredScalars(modal)).length,
});

export const filteredLabels = selectorFamily<string[], boolean>({
  key: "filteredLabels",
  get: (modal) => ({ get }) => {
    const labels = get(selectors.labelNames("sample"));

    let filtered = [];
    labels.forEach((path) => {
      get(labelFiltering.fieldIsFiltered({ modal, path })) &&
        filtered.push(path);
    });

    return filtered;
  },
  set: (modal) => ({ get, set }, newValue) => {
    const current = get(filteredLabels(modal));

    let paths = [];
    if (Array.isArray(newValue)) {
      paths = newValue;
    }

    current.forEach((path) => {
      if (paths.includes(path)) {
        return;
      }
    });
  },
});

export const numFilteredLabels = selectorFamily<number, boolean>({
  key: "numFilteredScalars",
  get: (modal) => ({ get }) => get(filteredLabels(modal)).length,
});

export const filteredFrameLabels = selectorFamily<string[], boolean>({
  key: "filteredFrameLabels",
  get: (modal) => ({ get }) => {
    const labels = get(selectors.labelNames("frame"));

    let filtered = [];
    labels.forEach((name) => {
      get(labelFiltering.fieldIsFiltered({ modal, path: "frames." + name })) &&
        filtered.push("frames." + name);
    });

    return filtered;
  },
});

export const numFilteredFrameLabels = selectorFamily<number, boolean>({
  key: "numFilteredFrameLabels",
  get: (modal) => ({ get }) => get(filteredFrameLabels(modal)).length,
});

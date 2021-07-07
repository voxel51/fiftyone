import { selectorFamily, GetRecoilValue, SetRecoilState } from "recoil";

import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import * as booleanFiltering from "./BooleanFieldFilter.state";
import * as labelFiltering from "./LabelFieldFilters.state";
import * as numericFiltering from "./NumericFieldFilter.state";
import * as stringFiltering from "./StringFieldFilter.state";

const clearGridFilters = ({ current, get, paths, set }) => {
  const filters = { ...get(selectors.filterStages) };
  current.forEach((path) => {
    if (!paths.includes(path)) {
      delete filters[path];
    }
  });
  set(selectors.filterStages, filters);
};

export const filteredScalars = selectorFamily<string[], boolean>({
  key: "filteredScalars",
  get: (modal) => ({ get }) => {
    const scalars = get(selectors.scalarNames("sample"));

    let filtered = [];
    scalars.forEach((path) => {
      if (get(booleanFiltering.isBooleanField(path))) {
        get(booleanFiltering.fieldIsFiltered({ modal, path })) &&
          filtered.push(path);
      } else if (get(numericFiltering.isNumericField(path))) {
        get(numericFiltering.fieldIsFiltered({ modal, path })) &&
          filtered.push(path);
      } else if (get(stringFiltering.isStringField(path))) {
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

    if (!modal) {
      clearGridFilters({ get, set, paths, current });
      return;
    }

    current.forEach((path) => {
      if (paths.includes(path)) {
        return;
      }
      if (get(booleanFiltering.isBooleanField(path))) {
        const [none, trueValue, falseValue] = [
          booleanFiltering.noneModalAtom,
          booleanFiltering.trueModalAtom,
          booleanFiltering.falseModalAtom,
        ];

        set(none(path), false);
        set(trueValue(path), false);
        set(falseValue(path), false);
      } else if (get(numericFiltering.isNumericField(path))) {
        const [noneValue, rangeValue] = [
          numericFiltering.noneModalAtom,
          numericFiltering.rangeModalAtom,
        ];

        set(noneValue({ path }), true);
        set(rangeValue({ path }), get(numericFiltering.boundsAtom({ path })));
      } else if (get(stringFiltering.isStringField(path))) {
        const [values, exclude] = [
          stringFiltering.selectedValuesModalAtom,
          stringFiltering.excludeModalAtom,
        ];

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

    clearLabelFilters({ get, set, modal, paths, current });
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
  set: (modal) => ({ get, set }, newValue) => {
    const current = get(filteredLabels(modal));

    let paths = [];
    if (Array.isArray(newValue)) {
      paths = newValue;
    }

    clearLabelFilters({ get, set, modal, paths, current });
  },
});

export const numFilteredFrameLabels = selectorFamily<number, boolean>({
  key: "numFilteredFrameLabels",
  get: (modal) => ({ get }) => get(filteredFrameLabels(modal)).length,
});

const clearLabelFilters = ({
  get,
  set,
  paths,
  current,
  modal,
}: {
  get: GetRecoilValue;
  set: SetRecoilState;
  paths: string[];
  current: string[];
  modal: boolean;
}) => {
  if (!modal) {
    const expandPaths = (values) =>
      values.reduce((acc, path): string[] => {
        path = `${path}${labelFiltering.getPathExtension(
          get(selectors.labelTypesMap)[path]
        )}`;
        const cPath = `${path}.confidence`;
        const lPath = `${path}.label`;
        return [...acc, cPath, lPath];
      }, []);
    current = expandPaths(current);
    paths = expandPaths(paths);
    clearGridFilters({ get, set, current, paths });
    return;
  }
  current.forEach((path) => {
    if (paths.includes(path)) {
      return;
    }
    path = `${path}${labelFiltering.getPathExtension(
      get(selectors.labelTypesMap)[path]
    )}`;
    const cPath = `${path}.confidence`;
    const lPath = `${path}.label`;

    set(
      atoms.hiddenLabels,
      Object.fromEntries(
        Object.entries(get(atoms.hiddenLabels)).filter(
          ([_, label]) => label.field !== path
        )
      )
    );

    const [noneValue, rangeValue] = [
      numericFiltering.noneModalAtom,
      numericFiltering.rangeModalAtom,
    ];
    set(noneValue({ path: cPath }), true);
    set(
      rangeValue({ path: cPath, defaultRange: [0, 1] }),
      get(numericFiltering.boundsAtom({ path: cPath, defaultRange: [0, 1] }))
    );

    const [values, exclude] = [
      stringFiltering.selectedValuesModalAtom,
      stringFiltering.excludeModalAtom,
    ];
    set(values(lPath), []);
    set(exclude(lPath), false);
  });
};

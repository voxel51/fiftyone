import { selectorFamily, GetRecoilValue, SetRecoilState } from "recoil";

import { filterStages, modalFilterStages } from "./atoms";
import * as selectors from "../../recoil/selectors";
import * as booleanFiltering from "./BooleanFieldFilter.state";
import * as labelFiltering from "./LabelFieldFilters.state";
import * as numericFiltering from "./NumericFieldFilter.state";
import * as stringFiltering from "./StringFieldFilter.state";
import { filterStages } from "./atoms";

const clearFilters = ({ current, get, modal, paths, set }) => {
  const atom = modal ? modalFilterStages : filterStages;
  const filters = { ...get(atom) };
  current.forEach((path) => {
    if (!paths.includes(path)) {
      delete filters[path];
    }
  });
  set(atom, filters);
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

    clearFilters({ get, set, modal, paths, current });
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
  modal,
  paths,
  current,
}: {
  get: GetRecoilValue;
  set: SetRecoilState;
  modal: boolean;
  paths: string[];
  current: string[];
}) => {
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
  clearFilters({ get, set, current, modal, paths });
  return;
};

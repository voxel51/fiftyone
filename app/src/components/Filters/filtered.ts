import { selectorFamily } from "recoil";

import { fieldIsFiltered as isBooleanFieldFiltered } from "./BooleanFieldFilter";
import { fieldIsFiltered as isLabelFieldFiltered } from "./LabelFieldFilter";
import { fieldIsFiltered as isNumericFieldFiltered } from "./NumericFieldFilter";
import { fieldIsFiltered as isStringFieldFiltered } from "./StringFieldFilter";
import { isBooleanField, isNumericField, isStringField } from "./utils";
import * as selectors from "../../recoil/selectors";

export const numFilteredScalars = selectorFamily<number, boolean>({
  key: "numFilteredScalars",
  get: (modal) => ({ get }) => {
    const scalars = get(selectors.scalarNames("sample"));

    let count = 0;
    scalars.forEach((path) => {
      if (get(isBooleanField(path))) {
        get(isBooleanFieldFiltered({ modal, path })) && count++;
      } else if (get(isNumericField(path))) {
        get(isNumericFieldFiltered({ modal, path })) && count++;
      } else if (get(isStringField(path))) {
        get(isStringFieldFiltered({ modal, path })) && count++;
      }
    });

    return count;
  },
});

export const numFilteredLabels = selectorFamily<number, boolean>({
  key: "numFilteredLabels",
  get: (modal) => ({ get }) => {
    const labels = get(selectors.labelNames("sample"));
    let count = 0;

    labels.forEach((path) => {
      get(isLabelFieldFiltered({ modal, path })) && count++;
    });

    return count;
  },
});

export const numFilteredFrameLabels = selectorFamily<number, boolean>({
  key: "numFilteredFrameLabels",
  get: (modal) => ({ get }) => {
    const labels = get(selectors.labelNames("frame"));
    let count = 0;

    labels.forEach((name) => {
      get(isLabelFieldFiltered({ modal, path: "frames." + name })) && count++;
    });

    return count;
  },
});

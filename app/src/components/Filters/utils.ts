import { selectorFamily } from "recoil";

import * as selectors from "../../recoil/selectors";
import {
  BOOLEAN_FIELD,
  STRING_FIELD,
  VALID_NUMERIC_TYPES,
} from "../../utils/labels";

export const isBooleanField = selectorFamily<boolean, string>({
  key: "isBooleanField",
  get: (name) => ({ get }) => {
    const map = get(selectors.scalarsMap("sample"));
    return map[name] === BOOLEAN_FIELD;
  },
});

export const isNumericField = selectorFamily<boolean, string>({
  key: "isNumericField",
  get: (name) => ({ get }) => {
    const map = get(selectors.scalarsMap("sample"));
    return VALID_NUMERIC_TYPES.includes(map[name]);
  },
});

export const isStringField = selectorFamily<boolean, string>({
  key: "isStringField",
  get: (name) => ({ get }) => {
    const map = get(selectors.scalarsMap("sample"));
    return map[name] === STRING_FIELD;
  },
});

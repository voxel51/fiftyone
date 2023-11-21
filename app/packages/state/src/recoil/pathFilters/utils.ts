import { selectorFamily } from "recoil";
import { isInListField } from "../schema";

export const isFilterDefault = selectorFamily<
  boolean,
  { modal: boolean; path: string }
>({
  key: "isFilterDefault",
  get:
    ({ modal, path }) =>
    ({ get }) =>
      modal || path === "_label_tags" || get(isInListField(path)),
});

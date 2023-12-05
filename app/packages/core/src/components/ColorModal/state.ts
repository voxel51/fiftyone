import { field } from "@fiftyone/state";
import { atom, selector } from "recoil";
import { ACTIVE_FIELD } from "./utils";

export const activeColorEntry = atom<{ path: string } | ACTIVE_FIELD | null>({
  key: "activeColorEntry",
  default: null,
});

export const activeColorPath = selector<string>({
  key: "activeColorPath",
  get: ({ get }) => {
    const entry = get(activeColorEntry);

    if (!entry || typeof entry === "string") {
      return entry as string;
    }

    return entry.path;
  },
});

export const activeColorField = selector({
  key: "activeColorField",
  get: ({ get }) => {
    const { path: _, ...fieldValue } = get(field(get(activeColorPath)));
    if (!field) {
      throw new Error(`path ${fieldValue} is not a field`);
    }

    return fieldValue;
  },
});

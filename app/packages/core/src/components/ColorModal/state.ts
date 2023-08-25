import { field } from "@fiftyone/state";
import { atom, selector } from "recoil";
import { ACTIVE_FIELD } from "./utils";

export const activeColorEntry = atom<{ path: string } | ACTIVE_FIELD | null>({
  key: "activeColorEntry",
  default: null,
});

export const activeColorField = selector({
  key: "activeColorField",
  get: ({ get }) => {
    const entry = get(activeColorEntry);

    if (!entry || typeof entry === "string") {
      throw new Error(`active color entry is ${entry}`);
    }

    const result = get(field(entry.path));
    if (!result) {
      throw new Error(`path ${entry.path} is not a field`);
    }

    return result;
  },
});

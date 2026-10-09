import { activeColorEntry, field } from "@fiftyone/state";
import { selector } from "@fiftyone/reverb";

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

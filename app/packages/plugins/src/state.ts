import { atom } from "@fiftyone/reverb";

export const pluginsLoaderAtom = atom<"loading" | "error" | "ready">({
  key: "pluginsLoaderAtom",
  default: "loading",
});

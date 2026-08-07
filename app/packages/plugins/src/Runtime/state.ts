import { atom } from "recoil";

export const pluginsLoaderAtom = atom<"loading" | "error" | "ready">({
  key: "pluginsLoaderAtom",
  default: "loading",
});

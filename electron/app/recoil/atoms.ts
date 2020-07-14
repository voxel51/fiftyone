import { atom } from "recoil";

export const activeTags = atom({
  key: "activeTags",
  default: ["tag"],
});

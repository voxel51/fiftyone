import { atom } from "recoil";

export const tick = atom<number>({
  key: "tick",
  default: 0,
  effects: [],
});

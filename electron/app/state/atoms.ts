import { atom } from "recoil";

export const indicatorPosition = atom({
  key: "indicatorPosition",
  default: 0,
});

export const mousePosition = atom({
  key: "mainMousePosition",
  default: [0, 0],
});

export const mainSize = atom({
  key: "mainSize",
  default: [0, 0],
});

export const mainTop = atom({
  key: "mainTop",
  default: 0,
});

export const viewCount = atom({
  key: "viewCount",
  default: 0,
});

export const currentIndex = atom({
  key: "currentIndex",
  default: 0,
});

export const currentListHeight = atom({
  key: "currentListHeight",
  default: 0,
});

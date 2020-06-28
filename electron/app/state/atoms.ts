import { atom, atomFamily } from "recoil";

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

export const currentListTop = atom({
  key: "currentListTop",
  default: 0,
});

export const isDraggingIndicator = atom({
  key: "isDraggingIndicator",
  default: false,
});

export const itemsPerRequest = atom({
  key: "itemsPerRequest",
  default: 50,
});

export const fields = atomFamily({
  key: "fields",
  default: {
    active: true,
    color: "#CCCCCC",
  },
});

export const segmentIsLoaded = atomFamily({
  key: "segmentIsLoaded",
  default: false,
});

export const itemPosition = atomFamily({
  key: "itemPosition",
  default: null,
});

export const gridMargin = atom({
  key: "gridMargin",
  default: 4,
});

export const mainLoaded = atom({
  key: "mainLoaded",
  default: false,
});

export const portNumber = atom({
  key: "portNumber",
  default: 5151,
});

export const isMainWidthResizing = atom({
  key: "isMainWidthResizing",
  default: false,
});

export const resizeWait = atom({
  key: "resizeWait",
  default: 0,
});

export const current = atomFamily({
  key: "current",
  default: null,
});

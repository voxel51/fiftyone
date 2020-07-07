import { atom, atomFamily } from "recoil";

export const indicatorPosition = atom({
  key: "indicatorPosition",
  default: 0,
});

export const mousePosition = atom({
  key: "mainMousePosition",
  default: [0, 0],
});

export const previousMainSize = atom({
  key: "previousMainSize",
  default: [0, 0],
});

export const mainSize = atom({
  key: "mainSize",
  default: [0, 0],
});

export const viewCount = atom({
  key: "viewCount",
  default: 0,
});

export const currentListTop = atom({
  key: "currentListTop",
  default: 0,
});

export const liveTop = atom({
  key: "liveTop",
  default: 0,
});

export const prevIndex = atom({
  key: "prevIndex",
  default: 0,
});

export const prevDisp = atom({
  key: "prevDisp",
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

export const previousLayout = atom({
  key: "previousLayout",
  default: null,
});

export const itemRowCache = atomFamily({
  key: "itemRowCache",
  default: null,
});

export const destinationTop = atom({
  key: "destinationIndex",
  default: null,
});

export const previousSegmentsToRender = atom({
  key: "previousSegmentsToRender",
  default: [],
});

export const firstBaseLayout = atom({
  key: "firstBaseLayout",
  default: {
    y: 0,
    height: 0,
  },
  dangerouslyAllowMutability: true,
});

export const secondBaseLayout = atom({
  key: "secondBaseLayout",
  default: {
    y: 0,
    height: 0,
  },
  dangerouslyAllowMutability: true,
});

export const rootIndex = atom({
  key: "rootIndex",
  default: 0,
  dangerouslyAllowMutability: true,
});

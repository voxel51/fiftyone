import { atom, selectorFamily } from "recoil";
import { SpaceNodeJSON } from "./types";

// a react hook for managing the state of all spaces in the app
// it should use recoil to persist the tree
export const spacesAtom = atom<{ [spaceId: string]: SpaceNodeJSON }>({
  key: "spaces",
  default: {},
});

export const spaceSelector = selectorFamily({
  key: "spaceSelector",
  get:
    (spaceId: string) =>
    ({ get }) => {
      return get(spacesAtom)[spaceId];
    },
  set:
    (spaceId: string) =>
    ({ get, set }, spaceState) => {
      const spaces = get(spacesAtom);
      const updateSpaces = { ...spaces };
      updateSpaces[spaceId] = spaceState as SpaceNodeJSON;
      set(spacesAtom, updateSpaces);
    },
});

export const panelTitlesState = atom({
  key: "panelTitles",
  default: new Map(),
});

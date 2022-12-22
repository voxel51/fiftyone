import { atom, selectorFamily } from "recoil";
import { PanelStatePartialParameter, SpaceNodeJSON } from "./types";

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

export const panelsStateAtom = atom({
  key: "panelsState",
  default: new Map(),
});

export const panelStateSelector = selectorFamily({
  key: "panelStateSelector",
  get:
    (panelId: string) =>
    ({ get }) => {
      return get(panelsStateAtom).get(panelId);
    },
  set:
    (panelId: string) =>
    ({ get, set }, newValue) => {
      const newState = new Map(get(panelsStateAtom));
      newState.set(panelId, newValue);
      set(panelsStateAtom, newState);
    },
});

export const panelStatePartialSelector = selectorFamily({
  key: "panelStatePartialSelector",
  get:
    (params: PanelStatePartialParameter) =>
    ({ get }) => {
      const { panelId, key } = params;
      return get(panelStateSelector(panelId))?.[key];
    },
  set:
    (params: PanelStatePartialParameter) =>
    ({ get, set }, newValue) => {
      const { panelId, key } = params;
      const currentState = get(panelStateSelector(panelId)) || {};
      const updatedState = { ...currentState, [key]: newValue };
      set(panelStateSelector(panelId), updatedState);
    },
});

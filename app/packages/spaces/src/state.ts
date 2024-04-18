import { COLOR_OPTIONS } from "@fiftyone/components";
import { atom, selectorFamily } from "recoil";
import {
  PanelStateParameter,
  PanelStatePartialParameter,
  PanelsCloseEffect,
  SpaceNodeJSON,
} from "./types";

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

export const panelsLocalStateAtom = atom({
  key: "panelsLocalState",
  default: new Map(),
});

export const panelStateSelector = selectorFamily({
  key: "panelStateSelector",
  get:
    (params: PanelStateParameter) =>
    ({ get }) => {
      const { panelId, local } = params;
      const stateAtom = getStateAtom(local);
      return get(stateAtom).get(panelId);
    },
  set:
    (params: PanelStateParameter) =>
    ({ get, set }, newValue) => {
      const { panelId, local } = params;
      const stateAtom = getStateAtom(local);
      const newState = new Map(get(stateAtom));
      newState.set(panelId, newValue);
      set(stateAtom, newState);
    },
});

export const panelStatePartialSelector = selectorFamily({
  key: "panelStatePartialSelector",
  get:
    (params: PanelStatePartialParameter) =>
    ({ get }) => {
      const { key, ...selectorParam } = params;
      return get(panelStateSelector(selectorParam))?.[key];
    },
  set:
    (params: PanelStatePartialParameter) =>
    ({ get, set }, newValue) => {
      const { key, ...selectorParam } = params;
      const currentState = get(panelStateSelector(selectorParam)) || {};
      const updatedState = { ...currentState, [key]: newValue };
      set(panelStateSelector(selectorParam), updatedState);
    },
});

export const previousTabsGroupAtom = atom<HTMLElement | null>({
  key: "previousTabsGroupAtom",
  default: null,
});

export const panelsCloseEffect: PanelsCloseEffect = {};

export const workspaceEditorStateAtom = atom({
  key: "workspaceEditorState",
  default: {
    open: false,
    oldName: "",
    name: "",
    description: "",
    color: COLOR_OPTIONS[0].color,
    edit: false,
  },
});

export interface Workspace {
  description: string;
  color: string;
  name: string;
}

export const savedWorkspacesAtom = atom({
  key: "savedWorkspacesSelect",
  default: {
    initialized: false,
    workspaces: [] as Workspace[],
  },
});

function getStateAtom(local?: boolean) {
  return local ? panelsLocalStateAtom : panelsStateAtom;
}

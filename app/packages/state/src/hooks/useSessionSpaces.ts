import { debounce, size } from "lodash";
import { useCallback, useMemo } from "react";
import { useRecoilState } from "recoil";
import { sessionSpaces } from "../recoil";

const SESSION_UPDATE_DEBOUNCE = 500;

const useSessionSpaces = () => {
  const [sessionSpacesState, setSessionSpacesState] =
    useRecoilState(sessionSpaces);

  const computedSessionSpaces = useMemo(
    () => toAppFormat(sessionSpacesState),
    [sessionSpacesState],
  );

  const computedPanelsState = useMemo(
    () => extractPanelsState(computedSessionSpaces),
    [computedSessionSpaces],
  );

  const setSessionSpaces = useCallback(
    (spaces: object, panelsState?: object) => {
      // a spaces root is a single node, never a list
      const formattedSpaces = toAPIFormat(spaces, panelsState) as APISpaceNode;
      setSessionSpacesState(formattedSpaces);
    },
    [setSessionSpacesState],
  );

  const setSessionSpacesDebounced = useMemo(() => {
    return debounce(setSessionSpaces, SESSION_UPDATE_DEBOUNCE, {
      leading: true,
      trailing: true,
    });
  }, [setSessionSpaces]);

  return [
    computedSessionSpaces,
    setSessionSpacesDebounced,
    computedPanelsState,
  ];
};

export default useSessionSpaces;

/**
 * Utilities for API <> App session state conversion
 */

const nonPanelTypes = ["panel-container", "empty"];

export type APISpaceNode = {
  _cls: "Space" | "Panel";
  component_id: string;
  _version?: number;
  pinned?: boolean;
  state?: unknown;
  type?: string;
  children?: APISpaceTree;
  orientation?: string;
  active_child?: string;
  sizes?: number[];
  // saved workspaces carry their name on the root
  _name?: string;
};
export type APISpaceTree = APISpaceNode | APISpaceTree[];

function toAPIFormat(state, panelsState = {}): APISpaceTree {
  if (Array.isArray(state))
    return state.map((item) => toAPIFormat(item, panelsState));
  const apiState: APISpaceNode = {
    _cls: nonPanelTypes.includes(state.type) ? "Space" : "Panel",
    component_id: state.id,
  };
  // ordering clock for two-way sync; rides the root only (see MainSpace)
  if (state._version !== undefined) apiState._version = state._version;
  if (apiState._cls === "Panel") {
    const isPinned = state.pinned;
    const panelState = panelsState[state.id];
    if (isPinned) apiState.pinned = isPinned;
    if (panelState) apiState.state = panelState;
    apiState.type = state.type;
  } else {
    apiState.children = toAPIFormat(state.children, panelsState);
    if (state.layout) apiState.orientation = state.layout;
    if (state.activeChild) apiState.active_child = state.activeChild;
    if (state.sizes) apiState.sizes = state.sizes;
  }
  return apiState;
}

/**
 * Converts session spaces (API format) to the app format SpaceNode reads.
 * App-format input passes through unchanged.
 */
export const sessionSpacesToAppFormat = (state) => toAppFormat(state);

function toAppFormat(state) {
  if (Array.isArray(state)) return state.map(toAppFormat);
  if (state._cls) {
    const appState = {
      id: state.component_id,
      children: state.children ? toAppFormat(state.children) : [],
      layout: state.orientation,
      activeChild: state.active_child,
      type: state.type,
      state: state.state || {}, // not used in SpaceNode atm
      pinned: state.pinned,
      sizes: state.sizes,
    };
    if (state._version !== undefined) appState._version = state._version;
    return appState;
  }
  return state;
}

function extractPanelsState(space) {
  const spaceState = {};
  if (!space) return spaceState;
  if (Array.isArray(space))
    return space.reduce(
      (spaceState, itemState) =>
        Object.assign(spaceState, extractPanelsState(itemState)),
      {},
    );
  // expects state from session to always be an object
  if (size(space.state) > 0) spaceState[space.id] = space.state;
  const spaceChildrenState = extractPanelsState(space.children);
  return { ...spaceState, ...spaceChildrenState };
}

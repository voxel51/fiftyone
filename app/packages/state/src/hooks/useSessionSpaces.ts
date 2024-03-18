import { size } from "lodash";
import { useMemo } from "react";
import { useRecoilState } from "recoil";
import { sessionSpaces } from "../recoil";

const useSessionSpaces = () => {
  const [sessionSpacesState, setSessionSpacesState] =
    useRecoilState(sessionSpaces);

  const computedSessionSpaces = useMemo(
    () => toAppFormat(sessionSpacesState),
    [sessionSpacesState]
  );

  const computedPanelsState = useMemo(
    () => extractPanelsState(computedSessionSpaces),
    [computedSessionSpaces]
  );

  function setSessionSpaces(spaces: object, panelsState?: object) {
    const formattedSpaces = toAPIFormat(spaces, panelsState);
    setSessionSpacesState(formattedSpaces);
  }
  return [computedSessionSpaces, setSessionSpaces, computedPanelsState];
};

export default useSessionSpaces;

/**
 * Utilities for API <> App session state conversion
 */

const nonPanelTypes = ["panel-container", "empty"];

function toAPIFormat(state, panelsState = {}) {
  if (Array.isArray(state))
    return state.map((item) => toAPIFormat(item, panelsState));
  const apiState = {
    _cls: nonPanelTypes.includes(state.type) ? "Space" : "Panel",
    component_id: state.id,
  };
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

function toAppFormat(state) {
  if (typeof state === "string") return toAppFormat(JSON.parse(state));
  if (Array.isArray(state)) return state.map(toAppFormat);
  if (state._cls)
    return {
      id: state.component_id,
      children: state.children ? toAppFormat(state.children) : [],
      layout: state.orientation,
      activeChild: state.active_child,
      type: state.type,
      state: state.state || {}, // not used in SpaceNode atm
      pinned: state.pinned,
      sizes: state.sizes,
    };
  return state;
}

function extractPanelsState(space) {
  const spaceState = {};
  if (!space) return spaceState;
  if (Array.isArray(space))
    return space.reduce(
      (spaceState, itemState) =>
        Object.assign(spaceState, extractPanelsState(itemState)),
      {}
    );
  // expects state from session to always be an object
  if (size(space.state) > 0) spaceState[space.id] = space.state;
  const spaceChildrenState = extractPanelsState(space.children);
  return { ...spaceState, ...spaceChildrenState };
}

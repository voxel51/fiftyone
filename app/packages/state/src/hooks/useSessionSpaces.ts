import * as foq from "@fiftyone/relay";
import { useMemo } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilValue } from "recoil";
import { stateSubscription, sessionSpaces } from "../recoil";
import useSendEvent from "./useSendEvent";

const nonPanelTypes = ["panel-container", "empty"];

function toAPIFormat(state) {
  if (Array.isArray(state)) return state.map(toAPIFormat);
  const apiState = {
    _cls: nonPanelTypes.includes(state.type) ? "Space" : "Panel",
    component_id: state.id,
  };
  if (apiState._cls === "Panel") {
    if (state.pinned) apiState.pinned = state.pinned;
    apiState.type = state.type;
  } else {
    apiState.children = toAPIFormat(state.children);
    if (state.layout) apiState.orientation = state.layout;
    if (state.activeChild) apiState.active_child = state.activeChild;
  }
  return apiState;
}

function toAppFormat(state) {
  if (typeof state === "string") return toAppFormat(JSON.parse(state));
  if (Array.isArray(state)) return state.map(toAppFormat);
  if (state._id)
    return {
      id: state.component_id,
      children: state.children ? toAppFormat(state.children) : [],
      layout: state.orientation,
      activeChild: state.active_child,
      type: state.type,
    };
  return state;
}

const useSessionSpaces = () => {
  const send = useSendEvent();
  const subscription = useRecoilValue(stateSubscription);
  const sessionSpacesState = useRecoilValue(sessionSpaces);
  const [commit] = useMutation<foq.setSpacesMutation>(foq.setSpaces);
  const onError = useErrorHandler();

  const computedSessionSpaces = useMemo(
    () => toAppFormat(sessionSpacesState),
    [sessionSpacesState]
  );

  function setSessionSpaces(spaces: object) {
    return send((session) =>
      commit({
        onError,
        variables: { subscription, session, spaces: toAPIFormat(spaces) },
      })
    );
  }
  return [computedSessionSpaces, setSessionSpaces];
};

export default useSessionSpaces;

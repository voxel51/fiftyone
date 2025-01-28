import {
  SpaceNodeJSON,
  SpacesRoot,
  SpaceTree,
  usePanelsState,
  useSpaces,
} from "@fiftyone/spaces";
import { constants, useSessionSpaces, useUnboundState } from "@fiftyone/state";
import { isEqual, size } from "lodash";
import React, { useEffect, useRef } from "react";

const { FIFTYONE_GRID_SPACES_ID } = constants;

function MainSpace() {
  const [sessionSpaces, setSessionSpaces, sessionPanelsState] =
    useSessionSpaces();
  const { spaces, updateSpaces, clearSpaces } = useSpaces(
    FIFTYONE_GRID_SPACES_ID,
    sessionSpaces
  );
  const [panelsState, setPanelsState] = usePanelsState();
  const oldSpaces = useRef<SpaceTree | SpaceNodeJSON>(spaces);
  const oldPanelsState = useRef(panelsState);
  const isMounted = useRef(false);
  const unboundState = useUnboundState({
    spaces,
    sessionSpaces,
    panelsState,
    sessionPanelsState,
    updateSpaces,
    setPanelsState,
    setSessionSpaces,
  });

  useEffect(() => clearSpaces, [clearSpaces]);

  // Update local spaces layout to latest session spaces layout
  useEffect(() => {
    const { spaces, updateSpaces } = unboundState;
    if (!spaces.equals(sessionSpaces)) {
      updateSpaces(sessionSpaces);
    }
  }, [unboundState, sessionSpaces]);

  // Update local panels state to latest session panels state
  useEffect(() => {
    const { panelsState, setPanelsState } = unboundState;
    if (size(sessionPanelsState) && !isEqual(sessionPanelsState, panelsState)) {
      setPanelsState(sessionPanelsState);
    }
  }, [unboundState, sessionPanelsState]);

  // Update session spaces layout and panels state to latest local spaces layout and panels state
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    const { sessionSpaces, sessionPanelsState, setSessionSpaces } =
      unboundState;
    const serializedSpaces = spaces.toJSON();
    const spacesUpdated =
      !spaces.equals(sessionSpaces) && !spaces.equals(oldSpaces.current);
    const panelsStateUpdated =
      !isEqual(sessionPanelsState, panelsState) &&
      !isEqual(panelsState, oldPanelsState.current);
    if (spacesUpdated || panelsStateUpdated) {
      setSessionSpaces(serializedSpaces, panelsState);
    }
    oldSpaces.current = serializedSpaces;
    oldPanelsState.current = panelsState;
  }, [unboundState, oldSpaces, panelsState, spaces]);

  return <SpacesRoot id={FIFTYONE_GRID_SPACES_ID} />;
}

export default React.memo(MainSpace);

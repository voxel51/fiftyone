import { SpacesRoot, usePanelsState, useSpaces } from "@fiftyone/spaces";
import { constants, useSessionSpaces } from "@fiftyone/state";
import { isEqual, size } from "lodash";
import React, { useEffect, useRef } from "react";

const { FIFTYONE_GRID_SPACEs_ID } = constants;

function MainSpace() {
  const [sessionSpaces, setSessionSpaces, sessionPanelsState] =
    useSessionSpaces();
  const { spaces, updateSpaces, clearSpaces } = useSpaces(
    FIFTYONE_GRID_SPACEs_ID,
    sessionSpaces
  );
  const [panelsState, setPanelsState] = usePanelsState();
  const oldSpaces = useRef(spaces);
  const oldPanelsState = useRef(panelsState);
  const isMounted = useRef(false);

  useEffect(() => clearSpaces, [clearSpaces]);

  useEffect(() => {
    if (!spaces.equals(sessionSpaces)) {
      updateSpaces(sessionSpaces);
    }
  }, [sessionSpaces]);

  useEffect(() => {
    if (size(sessionPanelsState) && !isEqual(sessionPanelsState, panelsState)) {
      setPanelsState(sessionPanelsState);
    }
  }, [sessionPanelsState]);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
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
  }, [
    oldSpaces,
    panelsState,
    sessionSpaces,
    sessionPanelsState,
    setSessionSpaces,
    spaces,
  ]);

  return <SpacesRoot id={FIFTYONE_GRID_SPACEs_ID} />;
}

export default React.memo(MainSpace);

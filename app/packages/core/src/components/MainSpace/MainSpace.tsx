import { SpacesRoot, usePanelsState, useSpaces } from "@fiftyone/spaces";
import { constants, useSessionSpaces } from "@fiftyone/state";
import { isEqual, size } from "lodash";
import React, { useEffect, useRef } from "react";

const { FIFTYONE_GRID_SPACES_ID } = constants;

function MainSpace() {
  const [sessionSpaces, setSessionSpaces, sessionPanelsState] =
    useSessionSpaces();
  const { spaces, updateSpaces, clearSpaces } = useSpaces(
    FIFTYONE_GRID_SPACES_ID,
    sessionSpaces,
  );
  const [panelsState, setPanelsState] = usePanelsState();
  const oldSpaces = useRef(spaces);
  const oldPanelsState = useRef(panelsState);
  const isMounted = useRef(false);
  // Lamport-style ordering for the two-way spaces sync: every local push
  // stamps an incremented _version, and an incoming session value older
  // than the last push is a stale reflection (debounced trailing writes,
  // event echoes) and must not clobber newer local state. Unversioned
  // payloads (workspace loads, legacy state) stay authoritative.
  const versionRef = useRef(0);

  useEffect(() => clearSpaces, [clearSpaces]);

  useEffect(() => {
    const incoming = sessionSpaces?._version;
    // an echo carrying our current version is our own reflection: the
    // local tree is at least as new (a just-clicked change may not have
    // been stamped yet), so only strictly newer versions apply
    if (incoming !== undefined && incoming <= versionRef.current) {
      return;
    }
    if (incoming !== undefined) {
      versionRef.current = incoming;
    }
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
      versionRef.current += 1;
      setSessionSpaces(
        { ...serializedSpaces, _version: versionRef.current },
        panelsState,
      );
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

  return <SpacesRoot id={FIFTYONE_GRID_SPACES_ID} />;
}

export default React.memo(MainSpace);

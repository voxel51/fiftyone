/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useLocationParam } from "@fiftyone/location";
import {
  getSessionRef,
  useClearModal,
  useSetExpandedSample,
  useSetModalState,
} from "@fiftyone/state";
import { useEffect, useRef } from "react";
import { isSelected } from "./modal";
import { groupIdParam, sampleIdParam } from "./params";

/**
 * The URL owns the open sample, so a move the App did not make (Back,
 * Forward) is applied from it. A cold load is left to the session the server
 * replays.
 */
export default function useModalFromLocation() {
  const [groupId] = useLocationParam(groupIdParam);
  const [id] = useLocationParam(sampleIdParam);
  const clear = useClearModal();
  const open = useSetExpandedSample();
  const setModalState = useSetModalState();
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    const selected = groupId ? { groupId } : id ? { id } : undefined;
    if (isSelected(selected, getSessionRef().modalSelector)) return;
    if (!selected) {
      clear();
      return;
    }
    setModalState().then(() => open(selected));
  }, [clear, groupId, id, open, setModalState]);
}

/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useLocation } from "@fiftyone/location";
import {
  getSessionRef,
  useResetModal,
  useSetExpandedSample,
  useSetModalState,
} from "@fiftyone/state";
import { useEffect, useRef } from "react";
import { useAppSampleTransition } from "../samplePage/context";
import { isSelected } from "./modal";
import type { AppRoute } from "./routes";

/**
 * The URL owns the open sample, so a move the App did not make (Back,
 * Forward, a close) is applied from it. A cold load is left to the session the
 * server replays.
 */
export default function useModalFromLocation() {
  const { route } = useLocation<AppRoute>();
  const groupId = route.kind === "group" ? route.groupId : undefined;
  const id = route.kind === "sample" ? route.id : undefined;
  const reset = useResetModal();
  const transition = useAppSampleTransition();
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
      // the page's close animates with the sample still on it
      transition.afterClose(reset);
      return;
    }
    setModalState().then(() => open(selected));
  }, [groupId, id, open, reset, setModalState, transition]);
}

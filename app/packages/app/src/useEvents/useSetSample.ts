/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { locationBridge } from "@fiftyone/location";
import { useSessionSetter, useSetModalState } from "@fiftyone/state";
import { useCallback } from "react";
import { writeModal } from "../location/modal";
import type { AppRoute } from "../location/routes";
import type { EventHandlerHook } from "./registerEvent";

const useSetSample: EventHandlerHook = () => {
  const setModalState = useSetModalState();
  const setter = useSessionSetter();

  return useCallback(
    (payload: { sample_id?: string; group_id?: string }) => {
      setModalState().then(() => {
        const selector =
          payload.group_id || payload.sample_id
            ? {
                groupId: payload.group_id as string,
                id: payload.sample_id as string,
              }
            : undefined;
        setter("modalSelector", selector);
        writeModal(locationBridge.current<AppRoute>(), selector);
      });
    },
    [setModalState, setter],
  );
};

export default useSetSample;

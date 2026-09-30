/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback } from "react";
import { useSetAppCount } from "../sharedSession/hooks";
import type { EventHandlerHook } from "./registerEvent";

const useAppCountUpdate: EventHandlerHook = () => {
  const setAppCount = useSetAppCount();

  return useCallback(
    (payload: { count: number }) => setAppCount(payload.count),
    [setAppCount],
  );
};

export default useAppCountUpdate;

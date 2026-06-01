/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  DEFAULT_LABEL_SELECTION_STYLE,
  useSessionSetter,
} from "@fiftyone/state";
import { useCallback } from "react";
import type { EventHandlerHook } from "./registerEvent";

const useSetLabelSelectionStyle: EventHandlerHook = () => {
  const setter = useSessionSetter();

  return useCallback(
    (payload) => {
      const incoming = payload?.style;
      const style =
        incoming && typeof incoming === "object"
          ? { ...DEFAULT_LABEL_SELECTION_STYLE, ...incoming }
          : DEFAULT_LABEL_SELECTION_STYLE;
      setter("labelSelectionStyle", style);
    },
    [setter]
  );
};

export default useSetLabelSelectionStyle;

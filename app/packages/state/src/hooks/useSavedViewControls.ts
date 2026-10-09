import {
  useResetReverbState,
  useReverbValue,
  useSetReverbState,
} from "@fiftyone/reverb";
import { useCallback } from "react";
import { canEditSavedViews, view, viewName } from "../atoms";

/** Loading and clearing saved views, and whether this viewer may edit them. */
const useSavedViewControls = () => {
  const permission = useReverbValue(canEditSavedViews);
  const setViewName = useSetReverbState(viewName);
  const resetView = useResetReverbState(view);
  const load = useCallback((slug: string) => setViewName(slug), [setViewName]);

  return {
    canEdit: permission.enabled === true,
    cannotEditReason: permission.message ?? undefined,
    load,
    clear: resetView,
  };
};

export default useSavedViewControls;

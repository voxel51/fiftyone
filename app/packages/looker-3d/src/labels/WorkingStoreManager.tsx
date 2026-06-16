import {
  useInitializeWorking,
  useResetWorkingOnModeChange,
  useTransientCleanup,
} from "../annotation/store";
import {
  useSyncWorkingLabelsToSidebar,
  useSyncWorkingToSidebar,
} from "../annotation/useSyncWorkingToSidebar";
import { type OverlayLabel } from "./loader";

/**
 * Manages the working annotation store lifecycle.
 */
export const WorkingStoreManager = ({
  rawOverlays,
}: {
  rawOverlays: OverlayLabel[];
}) => {
  useInitializeWorking(rawOverlays);
  useResetWorkingOnModeChange();
  useSyncWorkingToSidebar();
  useSyncWorkingLabelsToSidebar();
  useTransientCleanup();

  return null;
};

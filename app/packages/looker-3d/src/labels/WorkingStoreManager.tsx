import {
  useInitializeWorking,
  useResetWorkingOnModeChange,
  useTransientCleanup,
} from "../annotation/store";
import { useReset3dOnEditExit } from "../annotation/useReset3dOnEditExit";
import { useSyncWorkingToSidebar } from "../annotation/useSyncWorkingToSidebar";
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
  useTransientCleanup();
  useReset3dOnEditExit();

  return null;
};

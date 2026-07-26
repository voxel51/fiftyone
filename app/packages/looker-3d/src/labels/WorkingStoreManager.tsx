import {
  useInitializeWorking,
  useResetWorkingOnModeChange,
  useTransientCleanup,
} from "../annotation/store";
import { use3dInteractionAdapter } from "../annotation/use3dInteractionAdapter";
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
  use3dInteractionAdapter();
  useReset3dOnEditExit();
  useTransientCleanup();

  return null;
};

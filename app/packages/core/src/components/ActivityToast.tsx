import { useActivityToast } from "@fiftyone/state";
import { ActivityToast as VoodoActivityToast } from "@voxel51/voodo";

/**
 * Wrapper for VOODO's ActivityToast which manages toast state.
 */
export const ActivityToast = () => {
  const { config, open } = useActivityToast();
  return (
    <VoodoActivityToast
      open={open}
      icon={config.icon}
      message={config.message}
      variant={config.variant}
    />
  );
};

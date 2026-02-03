import { useActivityToast } from "@fiftyone/state";
import { Icon, ActivityToast as VoodoActivityToast } from "@voxel51/voodo";
import React from "react";

/**
 * Wrapper for VOODO's ActivityToast which manages toast state.
 */
export const ActivityToast = () => {
  const { config, open } = useActivityToast();
  return (
    <VoodoActivityToast
      open={open}
      icon={({ ...props }) =>
        config.iconName ? <Icon name={config.iconName} {...props} /> : null
      }
      message={config.message}
      variant={config.variant}
    />
  );
};

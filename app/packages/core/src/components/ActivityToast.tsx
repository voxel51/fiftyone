import { ActivityToast as VoodoActivityToast, Icon } from "@voxel51/voodo";
import { useActivityToast } from "@fiftyone/state";
import React from "react";

/**
 * Wrapper for VOODO's ActivityToast which manages toast state.
 */
export const ActivityToast = () => {
  const { config, open } = useActivityToast();

  return (
    <VoodoActivityToast
      open={open}
      icon={({ ...props }) => <Icon name={config.iconName} {...props} />}
      message={config.message}
      variant={config.variant}
    />
  );
};

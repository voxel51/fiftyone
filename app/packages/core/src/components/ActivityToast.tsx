import { useActivityToast } from "@fiftyone/state";
import {
  Icon,
  IconName,
  ActivityToast as VoodoActivityToast,
} from "@voxel51/voodo";
import React from "react";

/**
 * Wrapper for VOODO's ActivityToast which manages toast state.
 */
export const ActivityToast = () => {
  const { config, open } = useActivityToast();
  // resolve a bug where undefined icon names are not handled gracefully
  // TODO - handle this on the design system level
  const iconName = config.iconName ?? IconName.Check;
  return (
    <VoodoActivityToast
      open={open}
      icon={({ ...props }) => <Icon name={iconName} {...props} />}
      message={config.message}
      variant={config.variant}
    />
  );
};

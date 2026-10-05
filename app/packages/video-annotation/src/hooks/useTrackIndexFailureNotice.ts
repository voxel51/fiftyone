/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useActivityToast } from "@fiftyone/state";
import { IconName, Variant } from "@voxel51/voodo";
import { useEffect } from "react";

export const TRACK_INDEX_FAILED_MESSAGE =
  "Couldn't load this video's tracks. Track edits are off until you reopen the sample.";

/**
 * One toast each time the video's track index fails. Whole-track edits are
 * refused while it is failed; they stay silent and this explains them.
 */
export const useTrackIndexFailureNotice = (failed: boolean): void => {
  const { setConfig } = useActivityToast();

  useEffect(() => {
    if (failed) {
      setConfig({
        iconName: IconName.Error,
        message: TRACK_INDEX_FAILED_MESSAGE,
        variant: Variant.Danger,
      });
    }
  }, [failed, setConfig]);
};

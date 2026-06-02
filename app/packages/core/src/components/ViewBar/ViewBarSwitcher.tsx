/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Top-level mount point for the dataset ViewBar. Reads the
 * `VFF_NEW_VIEW_BAR` Voxel51 Feature Flag and renders
 * {@link NewViewBar} (clean-room rewrite, no xstate) when it's
 * enabled, otherwise the legacy {@link LegacyViewBar}.
 *
 * Until the flag resolves we render the legacy bar — better to show
 * stable behavior to users than to flash a not-yet-resolved state.
 */

import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import React from "react";
import NewViewBar from "./NewViewBar";
import LegacyViewBar from "./ViewBar";

const ViewBarSwitcher: React.FC = () => {
  const { isEnabled, isResolved } = useFeature({
    feature: FeatureFlag.VFF_NEW_VIEW_BAR,
    enableTracking: true,
  });
  return isResolved && isEnabled ? <NewViewBar /> : <LegacyViewBar />;
};

export default ViewBarSwitcher;

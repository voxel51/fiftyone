/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import * as fos from "@fiftyone/state";
import { Alert, AlertTitle } from "@mui/material";
import { useLayoutEffect } from "react";
import { useRecoilValue } from "recoil";

/**
 * Forces dataset pages onto a fresh FiftyOne subscription after a renderer
 * crash so the rest of the session uses a clean backend-synced state channel.
 */
const DatasetGridRendererFailoverReload = () => {
  const currentSubscription = useRecoilValue(fos.stateSubscription);
  const { forcedSubscription, hasAnyFailures } =
    fos.useGridCustomRendererFailover();

  /**
   * This layout effect performs the one-time reload that moves the app off the
   * poisoned synced subscription and onto the fail-open subscription created
   * for the rest of the browser session.
   */
  useLayoutEffect(() => {
    if (!hasAnyFailures || !forcedSubscription) {
      return;
    }

    if (currentSubscription === forcedSubscription) {
      return;
    }

    window.location.reload();
  }, [currentSubscription, forcedSubscription, hasAnyFailures]);

  return null;
};

/** Banner shown when the session has been switched to the built-in grid renderer. */
const DatasetGridRendererFailoverBanner = () => {
  const currentDatasetName = useRecoilValue(fos.datasetName);
  const gridRendererFailover =
    fos.useGridCustomRendererFailover(currentDatasetName);
  const shouldShowBanner = gridRendererFailover.isBannerVisible;

  if (!shouldShowBanner) {
    return null;
  }

  return (
    <Alert
      data-cy="dataset-grid-renderer-failover-banner"
      severity="warning"
      onClose={gridRendererFailover.dismissBanner}
      sx={{ mb: 2 }}
    >
      <AlertTitle>Using the built-in grid renderer</AlertTitle>A custom grid
      renderer
      {gridRendererFailover.failure?.rendererName
        ? ` "${gridRendererFailover.failure.rendererName}"`
        : ""}{" "}
      threw
      {gridRendererFailover.failure?.datasetName
        ? ` while rendering "${gridRendererFailover.failure.datasetName}"`
        : ""}{" "}
      so FiftyOne switched this dataset to the built-in grid renderer for the
      rest of this browser session.
    </Alert>
  );
};

export const DatasetGridRendererFailover = () => {
  return (
    <>
      <DatasetGridRendererFailoverReload />
      <DatasetGridRendererFailoverBanner />
    </>
  );
};

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
  const { failure, forcedSubscription } = fos.useGridCustomRendererFailover();

  /**
   * This layout effect performs the one-time reload that moves the app off the
   * poisoned synced subscription and onto the fail-open subscription created
   * for the rest of the browser session.
   */
  useLayoutEffect(() => {
    if (!failure || !forcedSubscription) {
      return;
    }

    if (currentSubscription === forcedSubscription) {
      return;
    }

    window.location.reload();
  }, [currentSubscription, failure, forcedSubscription]);

  return null;
};

/** Banner shown when the session has been switched to the built-in grid renderer. */
const DatasetGridRendererFailoverBanner = () => {
  const currentDatasetName = useRecoilValue(fos.datasetName);
  const gridRendererFailover = fos.useGridCustomRendererFailover();
  const failedDatasetName = gridRendererFailover.failure?.datasetName;
  const shouldShowBanner =
    gridRendererFailover.isBannerVisible &&
    Boolean(failedDatasetName) &&
    failedDatasetName === currentDatasetName;

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
      so FiftyOne switched all datasets to the built-in grid renderer for the
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

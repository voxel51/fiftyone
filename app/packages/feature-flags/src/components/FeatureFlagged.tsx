import { useFeature } from "../hooks";
import { Fragment } from "react";
import { FeatureFlag } from "../client";

/**
 * Component which conditionally renders children based on the status of a feature.
 *
 * @param feature Feature identifier
 * @param children Component to render if the feature is enabled
 * @param fallback Optional fallback component to render if the feature is disabled
 * @param resolving Optional component to render while the check is resolving
 * @param enableTracking If enabled, will emit tracking events
 */
export const FeatureFlagged = ({
  feature,
  children,
  fallback,
  resolving,
  enableTracking,
}: {
  feature: FeatureFlag;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  resolving?: React.ReactNode;
  enableTracking?: boolean;
}) => {
  const { isEnabled, isResolved } = useFeature({ feature, enableTracking });

  if (!isResolved) {
    return resolving ?? <Fragment />;
  }

  return isEnabled ? children : fallback ?? <Fragment />;
};

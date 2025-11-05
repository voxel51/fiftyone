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
 */
export const FeatureFlagged = ({
  feature,
  children,
  fallback,
  resolving,
}: {
  feature: FeatureFlag;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  resolving?: React.ReactNode;
}) => {
  const { isEnabled, isResolved } = useFeature({ feature });

  if (!isResolved) {
    return resolving ?? <Fragment />;
  }

  return isEnabled ? children : fallback ?? <Fragment />;
};

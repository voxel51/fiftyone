import { useFeature } from "../hooks";
import { Fragment } from "react";
import { FeatureFlag } from "../client";

/**
 * Component which conditionally renders children based on the status of a feature.
 *
 * @param feature Feature identifier
 * @param children Component to render if the feature is enabled
 * @param fallback Optional fallback component to render if the feature is disabled
 */
export const FeatureFlagged = ({
  feature,
  children,
  fallback,
}: {
  feature: FeatureFlag;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) => {
  const isFeatureEnabled = useFeature({ feature });

  const content = isFeatureEnabled ? children : fallback ?? <Fragment />;
  return <>{content}</>;
};

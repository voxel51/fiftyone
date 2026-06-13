import * as fos from "@fiftyone/state";
import React, { PropsWithChildren, ReactNode, useMemo } from "react";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import { useRecoilValue } from "recoil";
import { isAggregationTimeout } from "./TimedOutCounts";

const makeFallback = (fallback?: ReactNode) =>
  function GuardFallback({ error }: FallbackProps) {
    // only contain aggregation timeouts; let unrelated errors surface as real bugs
    if (!isAggregationTimeout(error)) {
      throw error;
    }
    return <>{fallback ?? null}</>;
  };

/**
 * Last-resort containment for a per-path aggregation timeout (gateway / killed op):
 * it never reaches the app-level boundary, so one field timing out can't error out
 * the page or block sibling fields. Resets — re-attempting the query — when the
 * view, filters, or refresher change (e.g. the user narrows results down).
 */
const AggregationGuard = ({
  children,
  fallback,
}: PropsWithChildren<{ fallback?: ReactNode }>) => {
  const view = useRecoilValue(fos.view);
  const filters = useRecoilValue(fos.filters);
  const refresher = useRecoilValue(fos.refresher);

  const FallbackComponent = useMemo(() => makeFallback(fallback), [fallback]);

  return (
    <ErrorBoundary
      FallbackComponent={FallbackComponent}
      resetKeys={[
        refresher,
        JSON.stringify(view ?? []),
        JSON.stringify(filters ?? {}),
      ]}
    >
      {children}
    </ErrorBoundary>
  );
};

export default AggregationGuard;

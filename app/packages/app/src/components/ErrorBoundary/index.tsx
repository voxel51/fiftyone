/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The boundary the App shell puts around everything, and what it shows when
 * something inside it throws.
 */

import { useTrackEvent } from "@fiftyone/analytics";
import { useClearModal } from "@fiftyone/state";
import { GraphQLError } from "@fiftyone/utilities";
import type { ComponentType, PropsWithChildren } from "react";
import { useEffect, useLayoutEffect } from "react";
import {
  ErrorBoundary as Boundary,
  type FallbackProps,
} from "react-error-boundary";

import ErrorDisplay from "./ErrorDisplay";

const Fallback = ({ error, resetErrorBoundary }: FallbackProps) => {
  const clearModal = useClearModal();
  const trackEvent = useTrackEvent();

  // A modal left open would sit on top of the error it caused
  useLayoutEffect(() => {
    clearModal();
  }, [clearModal]);

  useEffect(() => {
    trackEvent("uncaught_app_error", {
      error: error?.message || error?.name || error,
      stack: error?.stack,
      messages:
        error instanceof GraphQLError
          ? error.errors.map(({ message }) => message)
          : undefined,
    });
  }, [error, trackEvent]);

  return <ErrorDisplay error={error} onDismiss={resetErrorBoundary} />;
};

const ErrorBoundary = ({
  children,
  FallbackComponent = Fallback,
}: PropsWithChildren<{ FallbackComponent?: ComponentType<FallbackProps> }>) => (
  <Boundary FallbackComponent={FallbackComponent}>{children}</Boundary>
);

export default ErrorBoundary;

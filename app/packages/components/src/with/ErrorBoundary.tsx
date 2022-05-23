import React, { useLayoutEffect } from "react";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import { Error as ErrorPage } from "..";

const withErrorBoundary = <P extends {}>(Component: React.FC<P>) => {
  const ErrorWrapper: React.FC<FallbackProps> = ({
    error,
    resetErrorBoundary,
  }: FallbackProps) => {
    useLayoutEffect(() => {
      document.getElementById("modal")?.classList.remove("modalon");
    }, []);

    return (
      <ErrorPage
        error={error}
        reset={() => {
          resetErrorBoundary();
        }}
      />
    );
  };

  return (props: P) => {
    return (
      <ErrorBoundary FallbackComponent={ErrorWrapper}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
};

export default withErrorBoundary;

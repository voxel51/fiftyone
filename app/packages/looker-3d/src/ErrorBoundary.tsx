import { Loading } from "@fiftyone/components";
import { modalSampleId } from "@fiftyone/state";
import React, { useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { fo3dAssetsParseStatusLog } from "./state";

/**
 * This is to be used in conjunction with `Fo3dErrorBoundary` to add uncaught error logs to
 * the fo3d error logs atom.
 */
const AddFo3dErrorLogs = ({
  error,
  boundaryName,
}: {
  error: Error;
  boundaryName?: string;
}) => {
  const thisSampleId = useRecoilValue(modalSampleId);
  const setLogs = useSetRecoilState(fo3dAssetsParseStatusLog(thisSampleId));

  useEffect(() => {
    if (!error) {
      return;
    }

    const message = error.message || error.toString();
    const fullMessage = boundaryName
      ? `Error loading ${boundaryName}: ${message}`
      : message;

    setLogs((logs) => [...logs, { message: fullMessage, status: "error" }]);
  }, [boundaryName, error, setLogs]);

  return null;
};
export class Fo3dErrorBoundary extends React.Component<
  { children: React.ReactNode; boundaryName?: string; ignoreError?: boolean },
  { error: Error | string | null }
> {
  state = { error: null, hasError: false };

  static getDerivedStateFromError = (error: Error) => ({
    hasError: true,
    error,
  });

  componentDidCatch(error: Error) {
    this.setState({ error });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.ignoreError) {
        return (
          <AddFo3dErrorLogs
            error={this.state.error}
            boundaryName={this.props.boundaryName}
          />
        );
      }

      return (
        <Loading dataCy={"looker3d"}>
          <AddFo3dErrorLogs
            error={this.state.error}
            boundaryName={this.props.boundaryName}
          />
          <div data-cy="looker-error-info">
            {this.state.error instanceof Error
              ? this.state.error.message
              : this.state.error}
          </div>
        </Loading>
      );
    }

    return this.props.children;
  }
}

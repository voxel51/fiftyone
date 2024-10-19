import { usingAnalytics, AnalyticsInfo } from "@fiftyone/analytics";

/**
 * Tracks operator execution and errors.
 * @param operatorURI - The URI of the operator being executed.
 * @param params - The parameters of the operator execution.
 * @param info - The analytics info.
 * @param delegated - Whether the operation was delegated.
 * @param isRemote - Whether the operator is remote.
 * @param error - Any error that occurred during execution.
 */
export default function trackOperatorExecution(
  operatorURI: string,
  params: object,
  {
    info,
    delegated,
    isRemote,
    error,
  }: {
    info: AnalyticsInfo;
    delegated: boolean;
    isRemote: boolean;
    error?: string;
  }
): void {
  const analytics = usingAnalytics(info);
  const paramKeys = Object.keys(params || {});

  analytics.trackEvent("execute_operator", {
    uri: operatorURI,
    isRemote,
    delegated,
    params: paramKeys,
  });

  if (error) {
    analytics.trackEvent("execute_operator_error", {
      uri: operatorURI,
      isRemote,
      delegated,
      params: paramKeys,
      error,
    });
  }
}

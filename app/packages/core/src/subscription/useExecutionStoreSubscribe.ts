import { resolveOperatorURI } from "@fiftyone/operators/src/operators";
import * as fos from "@fiftyone/state";
import { getEventSource } from "@fiftyone/utilities/src/fetch";
import { EventSourceMessage } from "@microsoft/fetch-event-source";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRecoilCallback } from "recoil";
// Timeout duration (in milliseconds) after which the subscription is considered unhealthy if no 'ping' is received.
const UNHEALTHY_SUBSCRIPTION_TIMEOUT = 30 * 1000;

const EXECUTION_STORE_SUBSCRIBE_PATH = "/operators/subscribe-execution-store";

export type ExecutionStoreSubscribeCallback<T> = (
  key: string,
  value: T,
  metadata: Record<string, unknown>
) => void;

/**
 * Custom hook to subscribe to an execution store using Server-Sent Events (SSE).
 *
 * @param operatorUri - The URI of the execution store subscription operator.
 * The operator must be a SSE operator.
 * @param callback - Function to call when a new message is received.
 * @param datasetId - Optional ID of the dataset to subscribe to. If not provided, the subscription will be global.
 * @returns An object containing:
 *   - isSubscriptionHealthy: indicates the current health of the subscription.
 *   - unsubscribe: function to terminate the subscription.
 *   - resetSubscription: function to restart the subscription.
 */
export const useExecutionStoreSubscribe = <T>({
  operatorUri,
  callback,
  datasetId,
}: {
  operatorUri: string;
  callback: ExecutionStoreSubscribeCallback<T>;
  datasetId?: string;
}) => {
  // Use a ref to ensure the callback is stable over renders
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const abortControllerRef = useRef(new AbortController());

  const [isSubscriptionHealthy, setIsSubscriptionHealthy] = useState(false);

  const setSubscriptionNotHealthyTimerRef = useRef<number>(-1);

  /**
   * Handler for incoming SSE messages.
   * Clears any existing timeout and sets a new one when a 'ping' is received.
   * Otherwise, parses the event data and calls the provided callback.
   */
  const onMessageHandler = useCallback((event: EventSourceMessage) => {
    window.clearTimeout(setSubscriptionNotHealthyTimerRef.current);

    if (event.event === "ping") {
      setIsSubscriptionHealthy(true);

      setSubscriptionNotHealthyTimerRef.current = window.setTimeout(() => {
        setIsSubscriptionHealthy(false);
      }, UNHEALTHY_SUBSCRIPTION_TIMEOUT);

      return;
    }

    if (!event.data) {
      console.error("No data in execution store subscribe event");
      return;
    }

    try {
      const { key, value, metadata } = JSON.parse(event.data);
      callbackRef.current(key, value, metadata);
    } catch (error) {
      console.error(
        "Error parsing execution store subscribe event data:",
        error
      );
    }
  }, []);

  /**
   * Handler for SSE errors.
   * Logs the error and marks the subscription as unhealthy.
   */
  const onErrorHandler = useCallback((error: Error) => {
    console.error("SSE connection error:", error);
    setIsSubscriptionHealthy(false);
  }, []);

  /**
   * Handler for SSE connection closure.
   * Marks the subscription as unhealthy.
   */
  const onCloseHandler = useCallback(() => {
    setIsSubscriptionHealthy(false);
  }, []);

  const setupSubscription = useRecoilCallback(
    ({ snapshot }) =>
      () => {
        const datasetName = datasetId
          ? snapshot.getLoadable(fos.datasetName).getValue()
          : undefined;

        const resolvedOperatorUri = resolveOperatorURI(operatorUri);

        const data = {
          dataset_id: datasetId,
          operator_uri: resolvedOperatorUri,
          dataset_name: datasetName,
        };

        try {
          getEventSource(
            EXECUTION_STORE_SUBSCRIBE_PATH,
            {
              onmessage: onMessageHandler,
              onerror: onErrorHandler,
              onclose: onCloseHandler,
            },
            abortControllerRef.current.signal,
            data
          );
          setIsSubscriptionHealthy(true);
        } catch (error) {
          console.error("Error subscribing to execution store:", error);
        }
      },
    [operatorUri, datasetId, onMessageHandler, onErrorHandler, onCloseHandler]
  );

  const unsubscribe = useCallback(() => {
    abortControllerRef.current.abort();
    setIsSubscriptionHealthy(false);
  }, []);

  /**
   * Effect to initialize the subscription when dependencies change.
   * It also cleans up the subscription when the component unmounts.
   */
  useEffect(() => {
    if (!abortControllerRef.current.signal.aborted) {
      setupSubscription();
    } else {
      abortControllerRef.current = new AbortController();
      setupSubscription();
    }

    return () => {
      unsubscribe();
    };
  }, [setupSubscription, unsubscribe]);

  const resetSubscription = useCallback(() => {
    abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    setIsSubscriptionHealthy(false);
    setupSubscription();
  }, [setupSubscription]);

  return {
    /**
     * Indicates the current health of the subscription.
     */
    isSubscriptionHealthy,

    /**
     * Unsubscribes from the SSE connection by aborting the current AbortController.
     * Also marks the subscription as unhealthy.
     */
    unsubscribe,

    /**
     * Resets the subscription by aborting the current connection,
     */
    resetSubscription,
  };
};

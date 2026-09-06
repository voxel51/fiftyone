/**
 * A local `useExecutionStoreSubscribe`.
 *
 * `@fiftyone/core` is not exposed to plugin bundles (`externalize.ts` leaves
 * `__focore__` commented out), so the App's own hook cannot be imported.
 * This is the same shape over `getEventSource` from `@fiftyone/utilities`,
 * minus the recoil dependency: the dataset identity is passed in, and so is
 * the connect function, which is what lets this be tested without the App.
 *
 * Why a subscription at all: the generator's panel-data patches die with the
 * request stream, but the upload thread does not. This is how a reopened
 * panel — or a second tab — picks progress back up.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";

export const EXECUTION_STORE_SUBSCRIBE_PATH =
  "/operators/subscribe-execution-store";

export interface EventSourceMessage {
  event?: string;
  data?: string;
}

export interface EventSourceHandlers {
  onmessage?(event: EventSourceMessage): void;
  onopen?(): void;
  onclose?(): void;
  onerror?(error: Error): void;
}

/** `getEventSource`, narrowed to the four arguments this hook passes. */
export type EventSourceConnect = (
  path: string,
  handlers: EventSourceHandlers,
  signal: AbortSignal,
  body: Record<string, unknown>,
) => void;

export type StoreSubscriptionCallback<T> = (
  key: string,
  value: T,
  metadata: Record<string, unknown>,
) => void;

export interface StoreSubscriptionOptions<T> {
  operatorUri: string;
  datasetId?: string;
  datasetName?: string;
  onMessage: StoreSubscriptionCallback<T>;
  connect: EventSourceConnect;
}

export interface StoreSubscription {
  /** Aborts the current connection. */
  unsubscribe(): void;
  /** Aborts and reconnects — used when the dataset changes. */
  reset(): void;
}

export function useStoreSubscription<T>(
  options: StoreSubscriptionOptions<T>,
): StoreSubscription {
  const { operatorUri, datasetId, datasetName, onMessage, connect } = options;

  // Held in a ref so a caller may pass an inline closure without tearing the
  // subscription down on every render.
  const callback = useRef(onMessage);
  callback.current = onMessage;

  const controller = useRef<AbortController | null>(null);

  const handleMessage = useCallback((event: EventSourceMessage) => {
    // sse-starlette emits both keep-alive pings and unnamed empty frames;
    // neither is a message.
    if (event.event === "ping" || !event.data) {
      return;
    }

    try {
      const { key, value, metadata } = JSON.parse(event.data);
      callback.current(key, value as T, metadata ?? {});
    } catch (error) {
      // One bad frame must not drop the subscription carrying the bar.
      console.warn("cloud push: unreadable store frame", error);
    }
  }, []);

  const subscribe = useCallback(() => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;

    try {
      connect(
        EXECUTION_STORE_SUBSCRIBE_PATH,
        { onmessage: handleMessage },
        next.signal,
        {
          operator_uri: operatorUri,
          dataset_id: datasetId,
          dataset_name: datasetName,
        },
      );
    } catch (error) {
      console.warn("cloud push: could not subscribe to the store", error);
    }
  }, [connect, datasetId, datasetName, handleMessage, operatorUri]);

  const unsubscribe = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  useEffect(() => {
    subscribe();
    return unsubscribe;
  }, [subscribe, unsubscribe]);

  return useMemo(
    // `reset` mints a fresh controller rather than reusing the aborted one,
    // which would abort the new stream the instant it opened.
    () => ({ unsubscribe, reset: subscribe }),
    [subscribe, unsubscribe],
  );
}

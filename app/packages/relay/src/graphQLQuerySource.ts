/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { fetchQuery } from "react-relay";
import {
  type ConcreteRequest,
  type Disposable,
  type IEnvironment,
  type Snapshot,
  type Variables,
  createOperationDescriptor,
  handlePotentialSnapshotErrors,
} from "relay-runtime";

/**
 * The shape assumed of a response that no call site annotates. An
 * unparameterized tagged node cannot tell us the real one.
 */
export type QueryResponse = Readonly<Record<string, unknown>>;

interface QueryOperation<TData> {
  response: TData;
  variables: Variables;
}

/** Relay reports these on a snapshot without declaring them on the type. */
interface SnapshotErrors {
  missingRequiredFields: Parameters<typeof handlePotentialSnapshotErrors>[1];
  relayResolverErrors: Parameters<typeof handlePotentialSnapshotErrors>[2];
}

export interface QuerySource<TData> {
  /**
   * Retains the operation and follows local writes to the same part of the
   * graph for as long as the returned disposer is unused.
   */
  activate(onPayload: () => void): () => void;
  /**
   * Starts the fetch on the first call. Reading happens during render, so the
   * fetch is retained here rather than only in `activate`.
   */
  read(): TData | Promise<TData>;
}

/**
 * One in-flight query and its delivered value. A failure before the first
 * payload rejects; a failure after one leaves the delivered value in place.
 */
export function querySource<TData extends object>(
  environment: IEnvironment,
  request: ConcreteRequest,
  variables: Variables,
): QuerySource<TData> {
  let status: "error" | "idle" | "pending" | "value" = "idle";
  let current: TData;
  let promise: Promise<TData>;
  let settle: (data: TData) => void;
  let reject: (reason: unknown) => void;

  const listeners = new Set<() => void>();
  let notifying = false;

  /**
   * Deferred and coalesced because Relay may deliver synchronously from its
   * store, and a listener writes state that a read is in the middle of.
   */
  const notify = () => {
    if (notifying || listeners.size === 0) {
      return;
    }

    notifying = true;
    queueMicrotask(() => {
      notifying = false;
      for (const listener of listeners) {
        listener();
      }
    });
  };

  const deliver = (data: TData) => {
    const first = status === "pending";
    status = "value";
    current = data;

    if (first) {
      settle(data);
    }

    /**
     * Announced on the first payload too, so a held consumer drops the promise
     * and reads the value, rather than deriving a new promise from it forever.
     */
    notify();
  };

  const raise = (reason: unknown) => {
    if (status === "pending") {
      status = "error";
      reject(reason);
    }
  };

  /**
   * Shared by the fetch and by `activate`, and released only once neither
   * holds it. The fetch is issued from a render, which may be discarded before
   * anything mounts; without a retain the payload can be collected while this
   * source has already latched it as its value, and `read` would serve data
   * the store no longer has.
   */
  let retained: Disposable | undefined;
  let fetching: { unsubscribe(): void } | undefined;

  const retain = () => {
    retained ??= environment.retain(
      createOperationDescriptor(request, variables),
    );
  };

  const release = () => {
    if (listeners.size === 0) {
      fetching?.unsubscribe();
      fetching = undefined;
      retained?.dispose();
      retained = undefined;
    }
  };

  const start = () => {
    status = "pending";
    promise = new Promise<TData>((resolvePromise, rejectPromise) => {
      settle = resolvePromise;
      reject = rejectPromise;
    });
    // The reference held here outlives the consumer that awaits it.
    void promise.catch(() => undefined);

    retain();
    fetching = fetchQuery<QueryOperation<TData>>(
      environment,
      request,
      variables,
      { fetchPolicy: "store-or-network" },
    ).subscribe({ error: raise, next: deliver });
  };

  return {
    activate: (onPayload) => {
      const operation = createOperationDescriptor(request, variables);
      retain();
      const snapshots = environment.subscribe(
        environment.lookup(operation.fragment),
        (next: Snapshot) => {
          const reported = next as Partial<SnapshotErrors> & Snapshot;
          handlePotentialSnapshotErrors(
            environment,
            reported.missingRequiredFields,
            reported.relayResolverErrors ?? [],
          );

          if (
            !next.isMissingData &&
            next.data !== null &&
            next.data !== undefined
          ) {
            deliver(next.data as TData);
          }
        },
      );

      listeners.add(onPayload);

      return () => {
        listeners.delete(onPayload);
        snapshots.dispose();
        release();
      };
    },
    read: () => {
      if (status === "idle") {
        start();
      }

      return status === "value" ? current : promise;
    },
  };
}

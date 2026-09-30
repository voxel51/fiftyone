/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * A submit that waits for the operator registry. The search runs through a
 * server-side operator, and the registry that says whether it exists loads
 * after the bar renders — a query typed before then is held, not refused,
 * and runs (or explains itself) the moment the registry lands.
 */

import { useCallback, useEffect, useRef } from "react";

export interface DeferredSearchOptions<T> {
  /**
   * The registry has loaded, or failed to and never will — either way
   * `registered` is the answer.
   */
  settled: boolean;
  /** The search operator is in the registry. */
  registered: boolean;
  submit: (request: T) => void;
  /** The registry loaded without the operator: tell the user why nothing ran. */
  onUnavailable: () => void;
  /** A query was parked to wait for the registry — show it as in flight. */
  onHold: () => void;
  /** A parked query was dropped (no operator): the in-flight state ends. */
  onDrop: () => void;
}

export const useDeferredSearch = <T>({
  settled,
  registered,
  submit,
  onUnavailable,
  onHold,
  onDrop,
}: DeferredSearchOptions<T>): ((request: T) => void) => {
  // Only the latest query waits — a second Enter replaces the first
  const pending = useRef<{ request: T } | null>(null);

  useEffect(() => {
    if (!settled || pending.current === null) return;
    const { request } = pending.current;
    pending.current = null;
    if (registered) {
      submit(request);
    } else {
      onDrop();
      onUnavailable();
    }
  }, [settled, registered, submit, onUnavailable, onDrop]);

  return useCallback(
    (request: T) => {
      if (settled) {
        if (registered) submit(request);
        else onUnavailable();
        return;
      }
      pending.current = { request };
      onHold();
    },
    [settled, registered, submit, onUnavailable, onHold],
  );
};

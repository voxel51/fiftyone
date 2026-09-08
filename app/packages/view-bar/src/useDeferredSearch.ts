/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * A submit that waits for the operator registry. The search runs through a
 * server-side operator, and the registry that says whether it exists loads
 * after the bar renders — a query typed before then is held, not refused,
 * and runs (or explains itself) the moment the registry lands.
 */

import { useCallback, useEffect, useRef } from "react";

export interface DeferredSearchOptions {
  /** The registry has loaded, so `registered` is the truth. */
  loaded: boolean;
  /** The search operator is in the registry. */
  registered: boolean;
  submit: (query: string) => void;
  /** The registry loaded without the operator: tell the user why nothing ran. */
  onUnavailable: () => void;
  /** A query was parked to wait for the registry — show it as in flight. */
  onHold: () => void;
  /** A parked query was dropped (no operator): the in-flight state ends. */
  onDrop: () => void;
}

export const useDeferredSearch = ({
  loaded,
  registered,
  submit,
  onUnavailable,
  onHold,
  onDrop,
}: DeferredSearchOptions): ((query: string) => void) => {
  // Only the latest query waits — a second Enter replaces the first
  const pending = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded || pending.current === null) return;
    const query = pending.current;
    pending.current = null;
    if (registered) {
      submit(query);
    } else {
      onDrop();
      onUnavailable();
    }
  }, [loaded, registered, submit, onUnavailable, onDrop]);

  return useCallback(
    (query: string) => {
      if (loaded) {
        if (registered) submit(query);
        else onUnavailable();
        return;
      }
      pending.current = query;
      onHold();
    },
    [loaded, registered, submit, onUnavailable, onHold],
  );
};

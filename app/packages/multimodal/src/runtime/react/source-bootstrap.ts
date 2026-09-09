import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { ByteSourceDescriptor } from "../../ir";
import {
  getSourceBootstrap,
  getSourceBootstrapSnapshot,
  subscribeSourceBootstrap,
  type SourceBootstrap,
} from "../source-bootstrap-cache";

const EMPTY_SOURCE_BOOTSTRAP = (): null => null;
const NOOP_UNSUBSCRIBE = () => undefined;

/** React view of the grid-to-modal bootstrap facts for one byte source. */
export function useSourceBootstrap(
  source: ByteSourceDescriptor | null,
): SourceBootstrap | null {
  const subscribe = useCallback(
    (listener: () => void) =>
      source ? subscribeSourceBootstrap(source, listener) : NOOP_UNSUBSCRIBE,
    [source],
  );
  const getSnapshot = useCallback(
    () => (source ? getSourceBootstrapSnapshot(source) : null),
    [source],
  );
  const bootstrap = useSyncExternalStore(
    subscribe,
    getSnapshot,
    EMPTY_SOURCE_BOOTSTRAP,
  );

  // This effect makes the opened modal source recent in the bounded cache.
  useEffect(() => {
    if (source && bootstrap) getSourceBootstrap(source);
  }, [bootstrap, source]);

  return bootstrap;
}

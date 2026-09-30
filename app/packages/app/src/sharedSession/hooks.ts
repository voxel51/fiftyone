/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { appCountAtom } from "./model/atoms";

/**
 * How long a new App count must hold before it is believed. A reload briefly
 * overlaps the old event stream with its replacement, as does a notebook
 * handing its App from one cell to the next.
 */
export const APP_COUNT_SETTLE_MS = 2000;

/** Records the App count the server reported, or `null` once disconnected. */
export const useSetAppCount = () => useSetAtom(appCountAtom);

/**
 * The number of App clients sharing this server's session, or `null` when
 * this client is alone or not connected.
 */
export const useSharedSessionCount = (): number | null => {
  const count = useAtomValue(appCountAtom);
  const [settled, setSettled] = useState<number | null>(null);

  // This effect adopts a new count only once it has held for
  // APP_COUNT_SETTLE_MS, so reload and reconnect overlaps neither flash the
  // banner on nor blink it off.
  useEffect(() => {
    const timeout = setTimeout(() => setSettled(count), APP_COUNT_SETTLE_MS);

    return () => clearTimeout(timeout);
  }, [count]);

  return count !== null && settled !== null && settled > 1 ? settled : null;
};

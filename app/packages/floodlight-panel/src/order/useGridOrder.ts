/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import * as fos from "@fiftyone/state";
import { useEffect, useSyncExternalStore } from "react";
import { useRelayEnvironment } from "react-relay";
import usePanelMemo from "../Grid/panelMemory";
import type { OrderMode } from "../Grid/pageCursors";
import { createOrderHolder, openOrder } from "./order";

/**
 * The grid's order, opened as the panel's pages first need it and again
 * after a refresh. Before it opens, a collection known to be small is
 * taken as SMALL, so its rail and pages show from the first frame.
 */
export default function useGridOrder(refresh: unknown) {
  const environment = useRelayEnvironment();
  const input = fos.useGridOrderInput();
  const large = fos.useGridLargeCollection();
  const holder = usePanelMemo(
    "order",
    JSON.stringify([input, refresh]),
    () => createOrderHolder((signal) => openOrder(environment, input, signal)),
    (held) => held.dispose(),
  );
  const order = useSyncExternalStore(holder.subscribe, () => holder.current);

  // the rail and pages need the mode even before a page is fetched
  useEffect(() => void holder.get(), [holder]);

  const mode: OrderMode | undefined =
    order?.kind === "order"
      ? order.mode
      : !order && !large
        ? "SMALL"
        : undefined;

  return { get: holder.get, mode, order };
}

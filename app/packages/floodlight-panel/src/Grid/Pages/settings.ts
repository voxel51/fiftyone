/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Per-panel paging settings, kept in the panel's state beside its layout so
 * duplicate panels page independently.
 */

import { usePanelState } from "@fiftyone/spaces";
import { useCallback } from "react";
import { normalizeSize, type Paging } from "./model";

type GridLayout = "grid" | "groups" | "strip";

interface PagingState {
  paging?: Paging;
  pageSize?: number;
}

export default function usePagingSettings() {
  const [state, setState] = usePanelState<PagingState>({});
  const update = useCallback(
    (patch: PagingState) =>
      setState((current: PagingState | undefined) => ({
        ...current,
        ...patch,
      })),
    [setState],
  );

  return {
    pageSize: normalizeSize(state?.pageSize),
    paging: state?.paging ?? "scroll",
    setPageSize: useCallback(
      (pageSize: number) => update({ pageSize }),
      [update],
    ),
    setPaging: useCallback((paging: Paging) => update({ paging }), [update]),
  };
}

/** Pages mode applies to the Grid layout only; the others always scroll. */
export const usePagesEnabled = (layout: GridLayout) => {
  const { paging } = usePagingSettings();
  return layout === "grid" && paging === "pages";
};

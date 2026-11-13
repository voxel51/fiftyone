import type { SelectionRequest } from "@fiftyone/state/src/selection";
import { useCallback, useEffect, useRef } from "react";
import { highlightRevealedTile } from "./gridTileRegistry";

/** Reveals a sample, returning false only when it is outside the results. */
export type LocateInGrid = (
  sampleId: string,
  signal?: AbortSignal,
) => Promise<boolean>;

/** The retained-row reveal operation owned by a mounted grid. */
export interface RevealGrid {
  revealItem: (sampleId: string, signal: AbortSignal) => Promise<boolean>;
}

/** A prefetched destination that can replace the current grid when committed. */
export interface PreparedGridLocation {
  page: number;
  commit: () => void;
}

/** Waits can retire promptly even if an underlying transport ignores abort. */
async function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Owns one reveal from lookup through destination rendering; the latest wins. */
export default function useGridJump({
  scopeKey,
  datasetId,
  request,
  prepare,
  anchor,
  spotlight,
}: {
  scopeKey: string;
  datasetId: string;
  request: SelectionRequest;
  prepare: (
    datasetId: string,
    request: SelectionRequest,
    sampleId: string,
    signal: AbortSignal,
  ) => Promise<PreparedGridLocation | null>;
  anchor: (location: { page: number; at: string }) => void;
  spotlight?: RevealGrid;
}): LocateInGrid {
  const active = useRef<AbortController>();
  const current = useRef({ scopeKey, spotlight });
  current.current = { scopeKey, spotlight };
  const waiting = useRef<{
    origin?: RevealGrid;
    promise: Promise<RevealGrid>;
    ready: (grid: RevealGrid) => void;
  }>();

  // A view change or unmount retires both network work and an arrival cue.
  useEffect(
    () => () => {
      active.current?.abort();
      waiting.current = undefined;
    },
    [scopeKey],
  );

  // The replacement grid is the completion boundary, not the anchor write.
  useEffect(() => {
    if (spotlight && waiting.current && waiting.current.origin !== spotlight) {
      waiting.current.ready(spotlight);
      waiting.current = undefined;
    }
  }, [spotlight]);

  return useCallback(
    async (sampleId, externalSignal) => {
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      const { signal } = controller;
      const cancel = () => controller.abort(externalSignal?.reason);
      externalSignal?.addEventListener("abort", cancel, { once: true });
      if (externalSignal?.aborted) cancel();
      const timeout = setTimeout(
        () =>
          controller.abort(
            new DOMException(
              "Showing this item took too long. Try again.",
              "TimeoutError",
            ),
          ),
        15_000,
      );
      try {
        signal.throwIfAborted();
        // A committed swap may not have reached React yet. Never reveal in
        // the departing grid while an earlier anchor is still being applied.
        const grid = waiting.current
          ? await abortable(waiting.current.promise, signal)
          : current.current.spotlight;
        const shown =
          grid && (await abortable(grid.revealItem(sampleId, signal), signal));
        signal.throwIfAborted();
        if (!shown) {
          const destination = await abortable(
            prepare(datasetId, request, sampleId, signal),
            signal,
          );
          signal.throwIfAborted();
          if (current.current.scopeKey !== scopeKey)
            throw new DOMException("Grid changed", "AbortError");
          if (!destination) return false;
          let ready!: (grid: RevealGrid) => void;
          const nextGrid = new Promise<RevealGrid>((resolve) => {
            ready = resolve;
          });
          waiting.current = {
            origin: current.current.spotlight,
            ready,
            promise: nextGrid,
          };
          destination.commit();
          anchor({ page: destination.page, at: sampleId });
          const replacement = await abortable(nextGrid, signal);
          if (
            !(await abortable(replacement.revealItem(sampleId, signal), signal))
          )
            throw new Error(
              "The destination could not be rendered. Try again.",
            );
        }
        signal.throwIfAborted();
        await highlightRevealedTile(sampleId, signal);
        return true;
      } finally {
        clearTimeout(timeout);
        externalSignal?.removeEventListener("abort", cancel);
      }
    },
    [scopeKey, datasetId, request, prepare, anchor],
  );
}

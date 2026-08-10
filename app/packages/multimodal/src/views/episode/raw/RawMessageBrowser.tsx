import {
  clearInspectionMarker,
  publishInspectionMarker,
  usePlaybackStore,
} from "@fiftyone/playback/runtime";
import clsx from "clsx";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  RawRecordCursor,
  RawRecordIndexWindow,
  RawRecordResult,
} from "../../../ir";
import StructuredMessageTree from "../../../visualization/message/StructuredMessageTree";
import rawStyles from "../../../visualization/message/StructuredMessage.module.css";
import { virtualLogRowRange } from "../../../visualization/logs/log-console-virtualization";
import { errorMessage } from "../../../utils/errors";
import { useDataStream } from "../playback/data-stream-context";
import { useRawMessageContext } from "./raw-message-context";
import { formatExactRawMessageTime } from "./raw-message-time";
import styles from "./RawMessageBrowser.module.css";

const WINDOW_SIDE_ROWS = 50;
const WINDOW_EDGE_ROWS = 10;
const RAIL_ROW_HEIGHT_PX = 30;
const RAIL_OVERSCAN = 8;

/** Ephemeral exact-message browser mounted only for one fullscreen tile. */
export function RawMessageBrowser({
  anchor,
  markerOwnerId,
  onAddNumericFieldToPlot,
  onExit,
  renderMeta,
  streamKey,
}: {
  readonly anchor: RawRecordResult & { readonly cursor: RawRecordCursor };
  readonly markerOwnerId: string;
  readonly onAddNumericFieldToPlot: (path: string) => void;
  readonly onExit: () => void;
  readonly renderMeta: (
    result: RawRecordResult,
    options: {
      readonly copyCursor: RawRecordCursor;
      readonly copyDisabled: boolean;
    },
  ) => React.ReactNode;
  readonly streamKey: string;
}) {
  const { readRecordAtCursor, readRecordIndexWindow } = useRawMessageContext();
  const dataStream = useDataStream();
  const timeline = dataStream?.getTimelineIndex() ?? null;
  const playbackStore = usePlaybackStore();
  const [selectedCursor, setSelectedCursor] = useState(anchor.cursor);
  const [displayed, setDisplayed] = useState<RawRecordResult>(anchor);
  const [indexWindow, setIndexWindow] = useState<RawRecordIndexWindow>({
    entries: [
      {
        cursor: anchor.cursor,
        timestampNs: anchor.timestampNs ?? anchor.validFromNs,
      },
    ],
    hasNext: false,
    hasPrevious: false,
    selectedCursor: anchor.cursor,
  });
  const [indexStatus, setIndexStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [recordStatus, setRecordStatus] = useState<
    "ready" | "loading" | "error"
  >("ready");
  const [indexError, setIndexError] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [indexRetryVersion, setIndexRetryVersion] = useState(0);
  const [recordRetryVersion, setRecordRetryVersion] = useState(0);
  const [windowInitialized, setWindowInitialized] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);
  const lastWindowRequestCursorRef = useRef<RawRecordCursor | null>(null);
  const [viewport, setViewport] = useState({ height: 0, scrollTop: 0 });

  const selectedIndex = indexWindow.entries.findIndex(
    (entry) => entry.cursor === selectedCursor,
  );
  const selectedEntry = indexWindow.entries[selectedIndex];

  // This effect loads the first window and refreshes it only near a loaded
  // edge. Index rows stay bounded and payload decoding remains selected-only.
  useEffect(() => {
    const nearPrevious =
      selectedIndex >= 0 &&
      selectedIndex < WINDOW_EDGE_ROWS &&
      indexWindow.hasPrevious;
    const nearNext =
      selectedIndex >= 0 &&
      selectedIndex >= indexWindow.entries.length - WINDOW_EDGE_ROWS &&
      indexWindow.hasNext;
    const needsInitialWindow = !windowInitialized;
    if (
      (!needsInitialWindow && !nearPrevious && !nearNext) ||
      lastWindowRequestCursorRef.current === selectedCursor
    ) {
      return undefined;
    }

    const controller = new AbortController();
    let settled = false;
    lastWindowRequestCursorRef.current = selectedCursor;
    setIndexStatus("loading");
    void readRecordIndexWindow(
      streamKey,
      {
        after: WINDOW_SIDE_ROWS,
        anchorCursor: selectedCursor,
        before: WINDOW_SIDE_ROWS,
      },
      controller.signal,
    ).then(
      (result) => {
        if (controller.signal.aborted) return;
        settled = true;
        if (
          result.selectedCursor !== selectedCursor ||
          !result.entries.some((entry) => entry.cursor === selectedCursor)
        ) {
          setIndexStatus("error");
          setIndexError("Message index did not preserve the requested cursor");
          return;
        }
        setIndexWindow(result);
        setWindowInitialized(true);
        setIndexStatus("ready");
        setIndexError(null);
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        settled = true;
        setIndexStatus("error");
        setIndexError(errorMessage(caught));
      },
    );
    return () => {
      controller.abort();
      if (!settled && lastWindowRequestCursorRef.current === selectedCursor) {
        lastWindowRequestCursorRef.current = null;
      }
    };
  }, [
    readRecordIndexWindow,
    indexRetryVersion,
    selectedCursor,
    selectedIndex,
    streamKey,
    indexWindow.entries.length,
    indexWindow.hasNext,
    indexWindow.hasPrevious,
    windowInitialized,
  ]);

  // This effect cancels superseded exact decodes while retaining the last
  // displayed tree until the newly selected record arrives.
  useEffect(() => {
    if (selectedCursor === displayed.cursor) return undefined;
    const controller = new AbortController();
    setRecordStatus("loading");
    setRecordError(null);
    void readRecordAtCursor(streamKey, selectedCursor, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        if (result.cursor !== selectedCursor) {
          setRecordStatus("error");
          setRecordError("Exact message read returned a different cursor");
          return;
        }
        setDisplayed(result);
        setRecordStatus("ready");
        setRecordError(null);
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        setRecordStatus("error");
        setRecordError(errorMessage(caught));
      },
    );
    return () => controller.abort();
  }, [
    displayed.cursor,
    readRecordAtCursor,
    recordRetryVersion,
    selectedCursor,
    streamKey,
  ]);

  // This effect publishes the exact selected timestamp without tick snapping.
  useEffect(() => {
    const timestampNs =
      selectedEntry?.timestampNs ??
      (displayed.cursor === selectedCursor ? displayed.timestampNs : undefined);
    if (timestampNs !== undefined && timeline) {
      publishInspectionMarker(
        playbackStore,
        markerOwnerId,
        timeline.nsToSec(timestampNs),
      );
    }
  }, [
    displayed.cursor,
    displayed.timestampNs,
    markerOwnerId,
    playbackStore,
    selectedCursor,
    selectedEntry?.timestampNs,
    timeline,
  ]);

  // This effect ownership-safely clears the persistent marker on disposal.
  useEffect(
    () => () => clearInspectionMarker(playbackStore, markerOwnerId),
    [markerOwnerId, playbackStore],
  );

  const selectCursor = useCallback(
    (cursor: RawRecordCursor) => {
      setRecordError(null);
      setRecordStatus(cursor === displayed.cursor ? "ready" : "loading");
      setSelectedCursor(cursor);
    },
    [displayed.cursor],
  );
  const selectIndex = useCallback(
    (index: number) => {
      const next = indexWindow.entries[index];
      if (next) selectCursor(next.cursor);
    },
    [indexWindow.entries, selectCursor],
  );
  const selectByOffset = useCallback(
    (offset: number) => {
      selectIndex(selectedIndex + offset);
    },
    [selectIndex, selectedIndex],
  );
  const canPrevious = selectedIndex > 0;
  const canNext =
    selectedIndex >= 0 && selectedIndex < indexWindow.entries.length - 1;
  const retryIndexWindow = useCallback(() => {
    lastWindowRequestCursorRef.current = null;
    setIndexError(null);
    setIndexStatus("loading");
    setIndexRetryVersion((value) => value + 1);
  }, []);
  const retrySelectedRecord = useCallback(() => {
    setRecordError(null);
    setRecordStatus("loading");
    setRecordRetryVersion((value) => value + 1);
  }, []);

  const visibleRange = useMemo(
    () =>
      virtualLogRowRange({
        overscan: RAIL_OVERSCAN,
        rowCount: indexWindow.entries.length,
        rowHeightPx: RAIL_ROW_HEIGHT_PX,
        scrollTop: viewport.scrollTop,
        viewportHeight: viewport.height,
      }),
    [indexWindow.entries.length, viewport.height, viewport.scrollTop],
  );
  const visibleEntries = indexWindow.entries.slice(
    visibleRange.startIndex,
    visibleRange.endIndex,
  );
  const activeDescendant =
    selectedIndex >= visibleRange.startIndex &&
    selectedIndex < visibleRange.endIndex
      ? `raw-message-${encodeURIComponent(selectedCursor)}`
      : undefined;

  // This effect tracks the fixed-row viewport and keeps keyboard selection visible.
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;
    const publish = () =>
      setViewport({ height: rail.clientHeight, scrollTop: rail.scrollTop });
    publish();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(publish);
    observer.observe(rail);
    return () => observer.disconnect();
  }, []);
  // This effect keeps the active descendant inside the virtualized viewport.
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail || selectedIndex < 0) return;
    const top = selectedIndex * RAIL_ROW_HEIGHT_PX;
    const bottom = top + RAIL_ROW_HEIGHT_PX;
    const nextScrollTop =
      top < rail.scrollTop
        ? top
        : bottom > rail.scrollTop + rail.clientHeight
          ? Math.max(0, bottom - rail.clientHeight)
          : rail.scrollTop;
    if (nextScrollTop === rail.scrollTop) return;
    rail.scrollTop = nextScrollTop;
    setViewport({ height: rail.clientHeight, scrollTop: nextScrollTop });
  }, [selectedIndex]);

  const originNs = timeline?.startTimeNs;
  const statusError = recordError ?? indexError;
  const statusMessage = rawMessageBrowserStatus({
    canNext,
    canPrevious,
    entryCount: indexWindow.entries.length,
    hasNext: indexWindow.hasNext,
    hasPrevious: indexWindow.hasPrevious,
    indexStatus,
    recordStatus,
    statusError,
  });
  const handleRailKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      const pageRows = Math.max(
        1,
        Math.floor(viewport.height / RAIL_ROW_HEIGHT_PX),
      );
      let targetIndex: number;
      switch (event.key) {
        case "ArrowUp":
          targetIndex = selectedIndex - 1;
          break;
        case "ArrowDown":
          targetIndex = selectedIndex + 1;
          break;
        case "Home":
          targetIndex = 0;
          break;
        case "End":
          targetIndex = indexWindow.entries.length - 1;
          break;
        case "PageUp":
          targetIndex = selectedIndex - pageRows;
          break;
        case "PageDown":
          targetIndex = selectedIndex + pageRows;
          break;
        default:
          return;
      }
      event.preventDefault();
      event.stopPropagation();
      selectIndex(
        Math.max(0, Math.min(indexWindow.entries.length - 1, targetIndex)),
      );
    },
    [indexWindow.entries.length, selectIndex, selectedIndex, viewport.height],
  );
  return (
    <>
      <div className={styles.toolbar}>
        <button className={styles.toolbarButton} onClick={onExit} type="button">
          Return to playback
        </button>
        <button
          aria-label="Previous message"
          className={styles.toolbarButton}
          disabled={!canPrevious}
          onClick={() => selectByOffset(-1)}
          type="button"
        >
          Previous
        </button>
        <button
          aria-label="Next message"
          className={styles.toolbarButton}
          disabled={!canNext}
          onClick={() => selectByOffset(1)}
          type="button"
        >
          Next
        </button>
        {indexError ? (
          <button
            className={styles.toolbarButton}
            onClick={retryIndexWindow}
            type="button"
          >
            Retry nearby messages
          </button>
        ) : null}
        {recordError ? (
          <button
            className={styles.toolbarButton}
            onClick={retrySelectedRecord}
            type="button"
          >
            Retry selected message
          </button>
        ) : null}
        <span
          aria-live="polite"
          className={clsx(
            styles.status,
            statusError ? styles.error : undefined,
          )}
        >
          {statusMessage}
        </span>
      </div>
      <div className={styles.browser}>
        <div
          aria-label="Message index"
          aria-activedescendant={activeDescendant}
          className={styles.rail}
          onKeyDown={handleRailKeyDown}
          onScroll={(event) =>
            setViewport({
              height: event.currentTarget.clientHeight,
              scrollTop: event.currentTarget.scrollTop,
            })
          }
          ref={railRef}
          role="listbox"
          tabIndex={0}
        >
          <div
            className={styles.railSpacer}
            style={{
              height: indexWindow.entries.length * RAIL_ROW_HEIGHT_PX,
            }}
          >
            <div
              className={styles.railRows}
              style={{ transform: `translateY(${visibleRange.offsetPx}px)` }}
            >
              {visibleEntries.map((entry) => {
                const selected = entry.cursor === selectedCursor;
                return (
                  <div
                    aria-selected={selected}
                    className={clsx(
                      styles.railRow,
                      selected ? styles.selectedRow : undefined,
                    )}
                    id={`raw-message-${encodeURIComponent(entry.cursor)}`}
                    key={entry.cursor}
                    onClick={() => selectCursor(entry.cursor)}
                    role="option"
                    title="Select exact message"
                  >
                    {originNs !== undefined
                      ? formatExactRawMessageTime(entry.timestampNs, originNs)
                      : entry.timestampNs.toString()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className={styles.message}>
          {renderMeta(displayed, {
            copyCursor: selectedCursor,
            copyDisabled: displayed.cursor !== selectedCursor,
          })}
          <div className={rawStyles.scroll}>
            {displayed.status === "ok" && displayed.root ? (
              <StructuredMessageTree
                onAddNumericFieldToPlot={onAddNumericFieldToPlot}
                root={displayed.root}
              />
            ) : (
              <span className={rawStyles.notice}>
                No decoded payload for this message
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function rawMessageBrowserStatus({
  canNext,
  canPrevious,
  entryCount,
  hasNext,
  hasPrevious,
  indexStatus,
  recordStatus,
  statusError,
}: {
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  readonly entryCount: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
  readonly indexStatus: "error" | "loading" | "ready";
  readonly recordStatus: "error" | "loading" | "ready";
  readonly statusError: string | null;
}): string {
  if (statusError) return statusError;
  if (recordStatus === "loading") return "Loading selected message…";
  if (indexStatus === "loading") return "Loading nearby messages…";
  if (!canPrevious && !hasPrevious) return "Start of stream";
  if (!canNext && !hasNext) return "End of stream";
  return `${entryCount} nearby messages`;
}

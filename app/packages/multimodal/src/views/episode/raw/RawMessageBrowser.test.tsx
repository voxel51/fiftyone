import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  PlaybackProvider,
  useInspectionMarker,
  usePlayback,
} from "@fiftyone/playback/runtime";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RawRecordCursor,
  RawRecordIndexWindow,
  RawRecordResult,
} from "../../../ir";
import { RawMessageBrowser } from "./RawMessageBrowser";

const mocks = vi.hoisted(() => ({
  readRecordAtCursor:
    vi.fn<
      (
        stream: string,
        cursor: RawRecordCursor,
        signal?: AbortSignal,
      ) => Promise<RawRecordResult>
    >(),
  readRecordIndexWindow: vi.fn<
    (
      stream: string,
      request: {
        after: number;
        anchorCursor?: RawRecordCursor;
        before: number;
      },
      signal?: AbortSignal,
    ) => Promise<RawRecordIndexWindow>
  >(),
}));

const timeline = {
  nsToSec: (timeNs: bigint) => Number(timeNs) / 1_000_000_000,
  startTimeNs: 0n,
};

vi.mock("../playback/data-stream-context", () => ({
  useDataStream: () => ({ getTimelineIndex: () => timeline }),
}));

vi.mock("./raw-message-context", () => ({
  useRawMessageContext: () => ({
    readRecordAtCursor: mocks.readRecordAtCursor,
    readRecordIndexWindow: mocks.readRecordIndexWindow,
  }),
}));

vi.mock("../../../visualization/message/StructuredMessageTree", () => ({
  default: ({ root }: { root: { entries: readonly [string, unknown][] } }) => (
    <div data-testid="record-tree">{root.entries[0]?.[0]}</div>
  ),
}));

const INDEX_WINDOW: RawRecordIndexWindow = {
  entries: [
    { cursor: "cursor-1", timestampNs: 1_000_000_000n },
    { cursor: "cursor-2", timestampNs: 2_000_000_000n },
    { cursor: "cursor-3", timestampNs: 3_000_000_000n },
  ],
  hasNext: false,
  hasPrevious: false,
  selectedCursor: "cursor-2",
};

const CURSOR_ORDINALS = new Map<RawRecordCursor, bigint>([
  ["cursor-1", 1n],
  ["cursor-2", 2n],
  ["cursor-3", 3n],
]);

function record(cursor: string, timestampNs: bigint): RawRecordResult {
  return {
    cursor,
    encoding: "json",
    root: {
      entries: [[cursor, { kind: "scalar", value: "ok", valueType: "string" }]],
      kind: "object",
    },
    schemaName: "test.State",
    sourceName: "/state",
    status: "ok",
    streamId: "/state",
    timestampNs,
    truncated: false,
    validFromNs: timestampNs,
    validUntilNs: timestampNs + 1n,
  };
}

function MarkerReadout() {
  const marker = useInspectionMarker();
  return (
    <span data-testid="marker">
      {marker ? `${marker.ownerId}:${marker.timeSec}` : "none"}
    </span>
  );
}

function GlobalScrubButton() {
  const { seek } = usePlayback();
  return (
    <button onClick={() => seek(7)} type="button">
      Global scrub
    </button>
  );
}

function renderBrowser(onExit = vi.fn()) {
  function Harness() {
    const [showBrowser, setShowBrowser] = useState(true);
    return (
      <PlaybackProvider duration={10} stepInterval={1 / 30}>
        {showBrowser ? (
          <RawMessageBrowser
            anchor={
              record("cursor-2", 2_000_000_000n) as RawRecordResult & {
                cursor: RawRecordCursor;
              }
            }
            markerOwnerId="browser-owner"
            onAddNumericFieldToPlot={vi.fn()}
            onExit={() => {
              onExit();
              setShowBrowser(false);
            }}
            renderMeta={(result, options) => (
              <span
                data-copy-disabled={String(options.copyDisabled)}
                data-testid="record-meta"
              >
                {result.cursor}
              </span>
            )}
            streamKey="/state"
          />
        ) : null}
        <GlobalScrubButton />
        <MarkerReadout />
      </PlaybackProvider>
    );
  }
  return {
    onExit,
    ...render(<Harness />),
  };
}

beforeEach(() => {
  mocks.readRecordAtCursor.mockReset();
  mocks.readRecordAtCursor.mockImplementation((_stream, cursor) => {
    const ordinal = CURSOR_ORDINALS.get(cursor);
    if (ordinal === undefined) {
      return Promise.reject(new Error(`Unexpected cursor: ${cursor}`));
    }
    return Promise.resolve(record(cursor, ordinal * 1_000_000_000n));
  });
  mocks.readRecordIndexWindow.mockReset();
  mocks.readRecordIndexWindow.mockResolvedValue(INDEX_WINDOW);
});

afterEach(() => cleanup());

describe("RawMessageBrowser", () => {
  it("loads a bounded index window and publishes exact selected time", async () => {
    renderBrowser();

    await waitFor(() =>
      expect(mocks.readRecordIndexWindow).toHaveBeenCalledWith(
        "/state",
        { after: 50, anchorCursor: "cursor-2", before: 50 },
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByTestId("marker").textContent).toBe("browser-owner:2");
    expect(
      screen.getByRole("option", { name: "t=+3.000000000s" }),
    ).toBeTruthy();
  });

  it("retries a failed nearby-message window explicitly", async () => {
    mocks.readRecordIndexWindow.mockRejectedValueOnce(
      new Error("index unavailable"),
    );
    renderBrowser();

    await screen.findByText("index unavailable");
    expect(mocks.readRecordIndexWindow).toHaveBeenCalledOnce();

    fireEvent.click(
      screen.getByRole("button", { name: "Retry nearby messages" }),
    );

    await screen.findByRole("option", { name: "t=+1.000000000s" });
    expect(mocks.readRecordIndexWindow).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("index unavailable")).toBeNull();
  });

  it("rejects an index window that does not preserve its exact anchor", async () => {
    mocks.readRecordIndexWindow.mockResolvedValueOnce({
      ...INDEX_WINDOW,
      selectedCursor: "cursor-1",
    });
    renderBrowser();

    await screen.findByText(
      "Message index did not preserve the requested cursor",
    );
    expect(screen.getByTestId("record-meta").textContent).toBe("cursor-2");
    expect(screen.getByTestId("marker").textContent).toBe("browser-owner:2");
    expect(buttonDisabled("Previous message")).toBe(true);
    expect(buttonDisabled("Next message")).toBe(true);
    expect(mocks.readRecordAtCursor).not.toHaveBeenCalled();
  });

  it("navigates locally without replacing the displayed tree until decode finishes", async () => {
    let resolveFirst!: (result: RawRecordResult) => void;
    mocks.readRecordAtCursor.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    renderBrowser();
    await screen.findByRole("option", { name: "t=+1.000000000s" });

    fireEvent.click(screen.getByRole("button", { name: "Previous message" }));
    expect(screen.getByTestId("record-meta").textContent).toBe("cursor-2");
    expect(screen.getByTestId("record-meta").dataset.copyDisabled).toBe("true");
    expect(screen.getByText("Loading selected message…")).toBeTruthy();
    expect(screen.getByTestId("marker").textContent).toBe("browser-owner:1");

    resolveFirst(record("cursor-1", 1_000_000_000n));
    await waitFor(() =>
      expect(screen.getByTestId("record-meta").textContent).toBe("cursor-1"),
    );
    expect(screen.getByTestId("record-meta").dataset.copyDisabled).toBe(
      "false",
    );
  });

  it("aborts a stale exact read during rapid navigation", async () => {
    let firstSignal: AbortSignal | undefined;
    mocks.readRecordAtCursor.mockImplementationOnce(
      (_stream, _cursor, signal) => {
        firstSignal = signal;
        return new Promise(() => undefined);
      },
    );
    renderBrowser();
    await screen.findByRole("option", { name: "t=+1.000000000s" });

    fireEvent.click(screen.getByRole("button", { name: "Previous message" }));
    fireEvent.click(screen.getByRole("button", { name: "Next message" }));

    await waitFor(() => expect(firstSignal?.aborted).toBe(true));
    expect(screen.getByTestId("record-meta").textContent).toBe("cursor-2");
    expect(screen.queryByText("Loading selected message…")).toBeNull();
  });

  it("keeps the last displayed record when exact decoding fails", async () => {
    mocks.readRecordAtCursor.mockRejectedValueOnce(
      new Error("selected decode failed"),
    );
    renderBrowser();
    await screen.findByRole("option", { name: "t=+1.000000000s" });

    fireEvent.click(screen.getByRole("button", { name: "Previous message" }));

    await screen.findByText("selected decode failed");
    expect(screen.getByTestId("record-meta").textContent).toBe("cursor-2");
    expect(
      screen.queryByRole("button", { name: "Retry nearby messages" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry selected message" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("record-meta").textContent).toBe("cursor-1"),
    );
    expect(mocks.readRecordAtCursor).toHaveBeenCalledTimes(2);
  });

  it("rejects an exact read that returns a different cursor", async () => {
    mocks.readRecordAtCursor.mockResolvedValueOnce(
      record("cursor-3", 3_000_000_000n),
    );
    renderBrowser();
    await screen.findByRole("option", { name: "t=+1.000000000s" });

    fireEvent.click(screen.getByRole("button", { name: "Previous message" }));

    await screen.findByText("Exact message read returned a different cursor");
    expect(screen.getByTestId("record-meta").textContent).toBe("cursor-2");
    expect(screen.getByTestId("marker").textContent).toBe("browser-owner:1");
  });

  it("handles focused arrow navigation and leaves modified commands alone", async () => {
    const bubbled = vi.fn();
    render(
      <div onKeyDown={bubbled}>
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <RawMessageBrowser
            anchor={
              record("cursor-2", 2_000_000_000n) as RawRecordResult & {
                cursor: RawRecordCursor;
              }
            }
            markerOwnerId="browser-owner"
            onAddNumericFieldToPlot={vi.fn()}
            onExit={vi.fn()}
            renderMeta={() => null}
            streamKey="/state"
          />
          <MarkerReadout />
        </PlaybackProvider>
      </div>,
    );
    await screen.findByRole("option", { name: "t=+3.000000000s" });
    const rail = screen.getByRole("listbox", { name: "Message index" });

    fireEvent.keyDown(rail, { key: "ArrowDown" });
    expect(bubbled).not.toHaveBeenCalled();
    expect(screen.getByTestId("marker").textContent).toBe("browser-owner:3");

    fireEvent.keyDown(rail, { key: "Home" });
    expect(screen.getByTestId("marker").textContent).toBe("browser-owner:1");

    fireEvent.keyDown(rail, { key: "End" });
    expect(screen.getByTestId("marker").textContent).toBe("browser-owner:3");

    Object.defineProperty(rail, "clientHeight", {
      configurable: true,
      value: 60,
    });
    fireEvent.scroll(rail);
    fireEvent.keyDown(rail, { key: "PageUp" });
    expect(screen.getByTestId("marker").textContent).toBe("browser-owner:1");

    fireEvent.keyDown(rail, { key: "ArrowUp", metaKey: true });
    expect(bubbled).toHaveBeenCalledOnce();
  });

  it("stays in Browse across an ordinary global timeline scrub", async () => {
    renderBrowser();
    await screen.findByRole("option", { name: "t=+1.000000000s" });
    fireEvent.click(screen.getByRole("button", { name: "Previous message" }));
    await waitFor(() =>
      expect(screen.getByTestId("record-meta").textContent).toBe("cursor-1"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Global scrub" }));

    expect(screen.getByRole("listbox", { name: "Message index" })).toBeTruthy();
    expect(screen.getByTestId("record-meta").textContent).toBe("cursor-1");
    expect(screen.getByTestId("marker").textContent).toBe("browser-owner:1");
  });

  it("returns explicitly and ownership-safely clears its marker on disposal", async () => {
    const { onExit } = renderBrowser();
    await waitFor(() =>
      expect(screen.getByTestId("marker").textContent).toBe("browser-owner:2"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Return to playback" }));
    expect(onExit).toHaveBeenCalledOnce();
    expect(screen.getByTestId("marker").textContent).toBe("none");
  });
});

function buttonDisabled(name: string): boolean {
  const button = screen.getByRole("button", { name });
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`expected ${name} to be a button`);
  }
  return button.disabled;
}

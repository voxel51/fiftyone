import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRecordCursor, RawRecordResult } from "../../../ir";
import type { NumericFieldsEnumeration } from "../plots/numeric-series-context";
import type { RawRecordState } from "./raw-message-context";
import RawMessageTile from "./RawMessageTile";

const mocks = vi.hoisted(() => ({
  addFieldToPlot: vi.fn(),
  browserCopyDisabled: false,
  dataStream: {
    getTimelineIndex: () => ({ startTimeNs: 0n }),
    sourceKey: "source-1",
  },
  expandedTileId: null as string | null,
  ensureEnumeration: vi.fn(),
  ensureStreams: vi.fn(),
  enumeration: {
    status: "idle",
    streams: [],
  } as NumericFieldsEnumeration,
  isPlaying: false,
  isPlayPending: false,
  pause: vi.fn(),
  readFullMessageJson:
    vi.fn<(stream: string, anchor: bigint | string) => Promise<string>>(),
  recordState: null as RawRecordState | null,
  selectedStream: "/state",
  setSelectedStream: vi.fn(),
  setTileTitle: vi.fn(),
  streams: {
    status: "ready",
    streams: [
      {
        encoding: "json",
        sampleCount: 1,
        schemaName: "test.State",
        sourceName: "/state",
        streamId: "/state",
      },
    ],
  } as ReturnType<typeof readyRawStreams>,
  writeText: vi.fn<(text: string) => Promise<void>>(),
}));

const DISPLAYED_RESULT: RawRecordResult = {
  encoding: "json",
  payloadBytes: 1_024,
  root: {
    entries: [
      [
        "data",
        {
          items: [{ kind: "scalar", value: "7", valueType: "number" }],
          kind: "array",
          totalLength: 100,
        },
      ],
    ],
    kind: "object",
  },
  schemaName: "test.State",
  sourceName: "/state",
  status: "ok",
  streamId: "/state",
  timestampNs: 10_000_000_000n,
  truncated: true,
  validFromNs: 10_000_000_000n,
  validUntilNs: 20_000_000_000n,
};

vi.mock("@fiftyone/tiling", () => ({
  useSetTileTitle: () => mocks.setTileTitle,
  useTileId: () => "raw-1",
  useTiling: () => ({ expandedTileId: mocks.expandedTileId }),
}));

vi.mock("@fiftyone/playback/runtime", () => ({
  useIsPlaying: () => mocks.isPlaying,
  useIsPlayPending: () => mocks.isPlayPending,
  usePlayback: () => ({ pause: mocks.pause }),
}));

vi.mock("../playback/data-stream-context", () => ({
  useDataStream: () => mocks.dataStream,
}));

vi.mock("../plots/numeric-series-context", () => ({
  useNumericSeriesContext: () => ({
    ensureEnumeration: mocks.ensureEnumeration,
    enumeration: mocks.enumeration,
  }),
}));

vi.mock("./raw-message-context", () => ({
  useRawMessageContext: () => ({
    ensureStreams: mocks.ensureStreams,
    readFullMessageJson: mocks.readFullMessageJson,
    recordsByStream: new Map([[mocks.selectedStream, mocks.recordState]]),
    streams: mocks.streams,
    subscribeRecord: vi.fn(() => vi.fn()),
  }),
}));

vi.mock("../plots/use-add-field-to-plot", () => ({
  useAddFieldToPlot: () => mocks.addFieldToPlot,
}));

vi.mock("../tiles/raw-message-binding", () => ({
  useRawTileStream: () => mocks.selectedStream,
  useSetRawTileStream: () => mocks.setSelectedStream,
}));

vi.mock("./RawMessageTileSettings", () => ({ default: () => null }));

vi.mock("./RawMessageBrowser", () => ({
  RawMessageBrowser: ({
    anchor,
    onExit,
    renderMeta,
  }: {
    anchor: RawRecordResult & { cursor: RawRecordCursor };
    onExit: () => void;
    renderMeta: (
      result: RawRecordResult,
      options: { copyCursor: RawRecordCursor; copyDisabled: boolean },
    ) => ReactNode;
  }) => (
    <div data-testid="raw-message-browser">
      <span>{anchor.cursor}</span>
      {renderMeta(anchor, {
        copyCursor: anchor.cursor,
        copyDisabled: mocks.browserCopyDisabled,
      })}
      <button onClick={onExit} type="button">
        Return to playback
      </button>
    </div>
  ),
}));

beforeEach(() => {
  mocks.addFieldToPlot.mockReset();
  mocks.browserCopyDisabled = false;
  mocks.dataStream = {
    getTimelineIndex: () => ({ startTimeNs: 0n }),
    sourceKey: "source-1",
  };
  mocks.expandedTileId = null;
  mocks.ensureEnumeration.mockReset();
  mocks.ensureStreams.mockReset();
  mocks.enumeration = { status: "idle", streams: [] };
  mocks.readFullMessageJson.mockReset();
  mocks.isPlaying = false;
  mocks.isPlayPending = false;
  mocks.pause.mockReset();
  mocks.recordState = { result: DISPLAYED_RESULT, status: "ready" };
  mocks.selectedStream = "/state";
  mocks.setSelectedStream.mockReset();
  mocks.setTileTitle.mockReset();
  mocks.streams = readyRawStreams();
  mocks.writeText.mockReset();
  Object.assign(navigator, { clipboard: { writeText: mocks.writeText } });
});

afterEach(() => {
  cleanup();
});

describe("RawMessageTile", () => {
  it("fetches and copies the complete message instead of the display tree", async () => {
    const fullJson = JSON.stringify({ data: new Array(100).fill(7) }, null, 2);
    mocks.readFullMessageJson.mockResolvedValue(fullJson);
    mocks.writeText.mockResolvedValue(undefined);

    render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(fullJson));
    expect(mocks.readFullMessageJson).toHaveBeenCalledWith(
      "/state",
      DISPLAYED_RESULT.validFromNs,
    );
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("offers numeric fields for a canonical stream id", () => {
    mocks.selectedStream = "7";
    mocks.streams = readyRawStreams("7");
    mocks.enumeration = readyEnumeration();

    render(<RawMessageTile />);

    fireEvent.click(screen.getByTestId("episode-raw-plot-data.0"));
    expect(mocks.addFieldToPlot).toHaveBeenCalledWith("7", "data.0");
    expect(mocks.setTileTitle).toHaveBeenCalledWith("/state", {
      source: "auto",
    });
  });

  it("offers Browse only for a maximized exact-indexed stream", () => {
    mocks.recordState = {
      result: { ...DISPLAYED_RESULT, cursor: "cursor-10" },
      status: "ready",
    };
    mocks.streams = readyRawStreams("/state", true);

    const { rerender } = render(<RawMessageTile />);
    expect(
      screen.queryByRole("button", { name: "Browse messages" }),
    ).toBeNull();

    mocks.expandedTileId = "raw-1";
    rerender(<RawMessageTile />);
    expect(
      screen.getByRole("button", { name: "Browse messages" }),
    ).toBeTruthy();

    mocks.streams = readyRawStreams("/state", false);
    rerender(<RawMessageTile />);
    expect(
      screen.queryByRole("button", { name: "Browse messages" }),
    ).toBeNull();
  });

  it("pauses and anchors Browse to the displayed exact cursor", () => {
    mocks.expandedTileId = "raw-1";
    mocks.recordState = {
      result: { ...DISPLAYED_RESULT, cursor: "cursor-10" },
      status: "ready",
    };
    mocks.streams = readyRawStreams("/state", true);

    render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Browse messages" }));

    expect(mocks.pause).toHaveBeenCalledOnce();
    expect(screen.getByTestId("raw-message-browser").textContent).toContain(
      "cursor-10",
    );
  });

  it("exits Browse when playback starts or the tile is unmaximized", () => {
    mocks.expandedTileId = "raw-1";
    mocks.recordState = {
      result: { ...DISPLAYED_RESULT, cursor: "cursor-10" },
      status: "ready",
    };
    mocks.streams = readyRawStreams("/state", true);

    const { rerender } = render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Browse messages" }));
    expect(screen.getByTestId("raw-message-browser")).toBeTruthy();

    mocks.isPlaying = true;
    rerender(<RawMessageTile />);
    expect(screen.queryByTestId("raw-message-browser")).toBeNull();

    mocks.isPlaying = false;
    rerender(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Browse messages" }));
    expect(screen.getByTestId("raw-message-browser")).toBeTruthy();
    mocks.expandedTileId = null;
    rerender(<RawMessageTile />);
    expect(screen.queryByTestId("raw-message-browser")).toBeNull();
  });

  it("exits Browse as soon as Play becomes pending", () => {
    mocks.expandedTileId = "raw-1";
    mocks.recordState = {
      result: { ...DISPLAYED_RESULT, cursor: "cursor-10" },
      status: "ready",
    };
    mocks.streams = readyRawStreams("/state", true);

    const { rerender } = render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Browse messages" }));
    mocks.isPlayPending = true;
    rerender(<RawMessageTile />);

    expect(screen.queryByTestId("raw-message-browser")).toBeNull();
  });

  it("exits Browse when the selected stream changes", () => {
    mocks.expandedTileId = "raw-1";
    mocks.recordState = {
      result: { ...DISPLAYED_RESULT, cursor: "cursor-10" },
      status: "ready",
    };
    mocks.streams = readyRawStreams("/state", true);

    const { rerender } = render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Browse messages" }));

    mocks.selectedStream = "/other";
    mocks.streams = readyRawStreams("/other", true);
    rerender(<RawMessageTile />);

    expect(screen.queryByTestId("raw-message-browser")).toBeNull();
  });

  it("exits Browse when the source changes under the same stream", () => {
    mocks.expandedTileId = "raw-1";
    mocks.recordState = {
      result: { ...DISPLAYED_RESULT, cursor: "cursor-10" },
      status: "ready",
    };
    mocks.streams = readyRawStreams("/state", true);

    const { rerender } = render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Browse messages" }));

    mocks.dataStream = {
      getTimelineIndex: () => ({ startTimeNs: 0n }),
      sourceKey: "source-2",
    };
    rerender(<RawMessageTile />);

    expect(screen.queryByTestId("raw-message-browser")).toBeNull();
  });

  it("copies a browsable result by its exact cursor", async () => {
    const fullJson = JSON.stringify({ exact: true });
    mocks.expandedTileId = "raw-1";
    mocks.recordState = {
      result: { ...DISPLAYED_RESULT, cursor: "cursor-10" },
      status: "ready",
    };
    mocks.streams = readyRawStreams("/state", true);
    mocks.readFullMessageJson.mockResolvedValue(fullJson);
    mocks.writeText.mockResolvedValue(undefined);

    render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Browse messages" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));

    await waitFor(() =>
      expect(mocks.readFullMessageJson).toHaveBeenCalledWith(
        "/state",
        "cursor-10",
      ),
    );
    expect(mocks.writeText).toHaveBeenCalledWith(fullJson);
  });

  it("disables exact copy while the selected record is still loading", () => {
    mocks.browserCopyDisabled = true;
    mocks.expandedTileId = "raw-1";
    mocks.recordState = {
      result: { ...DISPLAYED_RESULT, cursor: "cursor-10" },
      status: "ready",
    };
    mocks.streams = readyRawStreams("/state", true);

    render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Browse messages" }));

    expect(screen.getByRole("button", { name: "Copy message" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("keeps Browse active for a legacy source-name binding", () => {
    mocks.expandedTileId = "raw-1";
    mocks.selectedStream = "/state";
    mocks.recordState = {
      result: {
        ...DISPLAYED_RESULT,
        cursor: "cursor-10",
        streamId: "7",
      },
      status: "ready",
    };
    mocks.streams = readyRawStreams("7", true);

    render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Browse messages" }));

    expect(screen.getByTestId("raw-message-browser")).toBeTruthy();
  });

  it("offers numeric fields for a legacy source-name binding", () => {
    mocks.selectedStream = "/state";
    mocks.enumeration = readyEnumeration();

    render(<RawMessageTile />);

    fireEvent.click(screen.getByTestId("episode-raw-plot-data.0"));
    expect(mocks.addFieldToPlot).toHaveBeenCalledWith("/state", "data.0");
  });

  it("names a failed canonical binding by its source name", () => {
    mocks.selectedStream = "7";
    mocks.streams = readyRawStreams("7");
    mocks.enumeration = readyEnumeration();
    mocks.recordState = { error: "decoder unavailable", status: "error" };

    render(<RawMessageTile />);

    expect(
      screen.getByText("Could not read /state: decoder unavailable"),
    ).toBeTruthy();
    expect(screen.queryByText(/Could not read 7/)).toBeNull();
  });

  it("clears a persisted binding absent from the current source", async () => {
    mocks.selectedStream = "/old-state";
    mocks.recordState = { result: DISPLAYED_RESULT, status: "ready" };

    render(<RawMessageTile />);

    await waitFor(() =>
      expect(mocks.setSelectedStream).toHaveBeenCalledWith(null),
    );
    expect(screen.queryByTestId("episode-raw-tree")).toBeNull();
  });
});

function readyRawStreams(streamId = "/state", supportsExactBrowsing = false) {
  return {
    status: "ready" as const,
    streams: [
      {
        encoding: "json",
        sampleCount: 1,
        schemaName: "test.State",
        sourceName: "/state",
        streamId,
        supportsExactBrowsing,
      },
    ],
  };
}

function readyEnumeration(): NumericFieldsEnumeration {
  return {
    status: "ready",
    streams: [
      {
        availability: "ready",
        encoding: "json",
        fields: [{ path: "data.0", valueType: "number" }],
        sourceName: "/state",
        streamId: "7",
      },
    ],
  };
}

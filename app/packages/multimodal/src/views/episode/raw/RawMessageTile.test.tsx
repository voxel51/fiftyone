import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRecordResult } from "../../../ir";
import type { NumericFieldsEnumeration } from "../plots/numeric-series-context";
import type { RawRecordState } from "./raw-message-context";
import RawMessageTile from "./RawMessageTile";

const mocks = vi.hoisted(() => ({
  addFieldToPlot: vi.fn(),
  ensureEnumeration: vi.fn(),
  ensureStreams: vi.fn(),
  enumeration: {
    status: "idle",
    streams: [],
  } as NumericFieldsEnumeration,
  readFullMessageJson:
    vi.fn<(stream: string, timeNs: bigint) => Promise<string>>(),
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
}));

vi.mock("../playback/data-stream-context", () => ({
  useDataStream: () => ({
    getTimelineIndex: () => ({ startTimeNs: 0n }),
  }),
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

beforeEach(() => {
  mocks.addFieldToPlot.mockReset();
  mocks.ensureEnumeration.mockReset();
  mocks.ensureStreams.mockReset();
  mocks.enumeration = { status: "idle", streams: [] };
  mocks.readFullMessageJson.mockReset();
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

function readyRawStreams(streamId = "/state") {
  return {
    status: "ready" as const,
    streams: [
      {
        encoding: "json",
        sampleCount: 1,
        schemaName: "test.State",
        sourceName: "/state",
        streamId,
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

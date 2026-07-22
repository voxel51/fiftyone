import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRecordResult } from "../../../ir";
import EpisodeRawMessageTile from "./EpisodeRawMessageTile";

const mocks = vi.hoisted(() => ({
  readFullMessageJson:
    vi.fn<(stream: string, timeNs: bigint) => Promise<string>>(),
  setTileTitle: vi.fn(),
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

vi.mock("../playback/episode-data-stream-context", () => ({
  useEpisodeDataStream: () => ({
    getTimelineIndex: () => ({ startTimeNs: 0n }),
  }),
}));

vi.mock("../plots/episode-numeric-series-context", () => ({
  useEpisodeNumericSeriesContext: () => ({
    ensureEnumeration: vi.fn(),
    enumeration: { status: "idle", streams: [] },
  }),
}));

vi.mock("./episode-raw-message-context", () => ({
  useEpisodeRawMessageContext: () => ({
    readFullMessageJson: mocks.readFullMessageJson,
    recordsByStream: new Map([
      ["/state", { result: DISPLAYED_RESULT, status: "ready" }],
    ]),
    subscribeRecord: vi.fn(() => vi.fn()),
  }),
}));

vi.mock("../plots/use-add-episode-field-to-plot", () => ({
  useAddEpisodeFieldToPlot: () => vi.fn(),
}));

vi.mock("../tiles/raw-message-binding", () => ({
  useEpisodeRawTileStream: () => "/state",
}));

vi.mock("./EpisodeRawMessageTileSettings", () => ({ default: () => null }));
vi.mock("../../../visualization/message/StructuredMessageTree", () => ({
  default: () => null,
}));

beforeEach(() => {
  mocks.readFullMessageJson.mockReset();
  mocks.setTileTitle.mockReset();
  mocks.writeText.mockReset();
  Object.assign(navigator, { clipboard: { writeText: mocks.writeText } });
});

afterEach(() => {
  cleanup();
});

describe("EpisodeRawMessageTile", () => {
  it("fetches and copies the complete message instead of the display tree", async () => {
    const fullJson = JSON.stringify({ data: new Array(100).fill(7) }, null, 2);
    mocks.readFullMessageJson.mockResolvedValue(fullJson);
    mocks.writeText.mockResolvedValue(undefined);

    render(<EpisodeRawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(fullJson));
    expect(mocks.readFullMessageJson).toHaveBeenCalledWith(
      "/state",
      DISPLAYED_RESULT.validFromNs,
    );
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  });
});

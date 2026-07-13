import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McapRawMessageRecordResult } from "../types";
import McapRawMessageTile from "./McapRawMessageTile";

const mocks = vi.hoisted(() => ({
  readFullMessageJson:
    vi.fn<(topic: string, timeNs: bigint) => Promise<string>>(),
  setTileTitle: vi.fn(),
  writeText: vi.fn<(text: string) => Promise<void>>(),
}));

const DISPLAYED_RESULT: McapRawMessageRecordResult = {
  encodedPayloadBytes: 1_024,
  logTimeNs: 10_000_000_000n,
  messageEncoding: "json",
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
  status: "ok",
  topic: "/state",
  truncated: true,
  validFromNs: 10_000_000_000n,
  validUntilNs: 20_000_000_000n,
};

vi.mock("@fiftyone/tiling", () => ({
  useSetTileTitle: () => mocks.setTileTitle,
}));

vi.mock("./mcap-data-stream-context", () => ({
  useMcapDataStream: () => ({
    getTimelineIndex: () => ({ startTimeNs: 0n }),
  }),
}));

vi.mock("./mcap-numeric-series-context", () => ({
  useMcapNumericSeriesContext: () => ({
    ensureEnumeration: vi.fn(),
    enumeration: { status: "idle", topics: [] },
  }),
}));

vi.mock("./mcap-raw-message-context", () => ({
  useMcapRawMessageContext: () => ({
    readFullMessageJson: mocks.readFullMessageJson,
    recordsByTopic: new Map([
      ["/state", { result: DISPLAYED_RESULT, status: "ready" }],
    ]),
    subscribeRecord: vi.fn(() => vi.fn()),
  }),
}));

vi.mock("./use-add-mcap-field-to-plot", () => ({
  useAddMcapFieldToPlot: () => vi.fn(),
}));

vi.mock("./mcap-raw-tile-state", () => ({
  useMcapRawTileTopic: () => "/state",
}));

vi.mock("./McapRawMessageTileSettings", () => ({ default: () => null }));
vi.mock("./McapRawMessageTree", () => ({ default: () => null }));

beforeEach(() => {
  mocks.readFullMessageJson.mockReset();
  mocks.setTileTitle.mockReset();
  mocks.writeText.mockReset();
  Object.assign(navigator, { clipboard: { writeText: mocks.writeText } });
});

afterEach(() => {
  cleanup();
});

describe("McapRawMessageTile", () => {
  it("fetches and copies the complete message instead of the display tree", async () => {
    const fullJson = JSON.stringify({ data: new Array(100).fill(7) }, null, 2);
    mocks.readFullMessageJson.mockResolvedValue(fullJson);
    mocks.writeText.mockResolvedValue(undefined);

    render(<McapRawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(fullJson));
    expect(mocks.readFullMessageJson).toHaveBeenCalledWith(
      "/state",
      DISPLAYED_RESULT.validFromNs,
    );
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  });
});

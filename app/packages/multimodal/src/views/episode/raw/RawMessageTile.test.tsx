import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRecordResult, RawValueNode } from "../../../ir";
import rawStyles from "../../../visualization/message/StructuredMessage.module.css";
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
    vi.fn<
      (stream: string, timeNs: bigint, signal?: AbortSignal) => Promise<string>
    >(),
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
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
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
      expect.any(AbortSignal),
    );
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("reports clipboard rejection instead of claiming the message was copied", async () => {
    mocks.readFullMessageJson.mockResolvedValue('{"data":7}');
    mocks.writeText.mockRejectedValue(new Error("clipboard permission denied"));

    render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));

    expect(
      await screen.findByRole("button", { name: "Copy failed" }),
    ).toBeTruthy();
    expect(screen.getByText("clipboard permission denied")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  });

  it("reports unavailable clipboard support without starting an export", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));

    expect(
      await screen.findByText("Clipboard access is unavailable"),
    ).toBeTruthy();
    expect(mocks.readFullMessageJson).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  });

  it("surfaces whole-message output limits as copy failures", async () => {
    mocks.readFullMessageJson.mockRejectedValue(
      new Error(
        "Complete message JSON exceeds the 8388608-code-unit copy/export limit",
      ),
    );

    render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));

    expect(
      await screen.findByText(/8388608-code-unit copy\/export limit/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy failed" })).toBeTruthy();
    expect(mocks.writeText).not.toHaveBeenCalled();
  });

  it("cancels an in-progress whole-message export", async () => {
    let requestSignal: AbortSignal | undefined;
    mocks.readFullMessageJson.mockImplementation(
      async (_stream, _timeNs, signal) => {
        requestSignal = signal;
        await new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
        return "unreachable";
      },
    );

    render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel copy" }));

    await waitFor(() => expect(requestSignal?.aborted).toBe(true));
    expect(
      await screen.findByRole("button", { name: "Copy message" }),
    ).toBeTruthy();
    expect(mocks.writeText).not.toHaveBeenCalled();
  });

  it("clears stale copy failure feedback when a retry is cancelled", async () => {
    mocks.readFullMessageJson
      .mockRejectedValueOnce(new Error("first copy failed"))
      .mockImplementationOnce(async (_stream, _timeNs, signal) => {
        await new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
        return "unreachable";
      });

    render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    fireEvent.click(await screen.findByRole("button", { name: "Copy failed" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel copy" }));

    expect(
      await screen.findByRole("button", { name: "Copy message" }),
    ).toBeTruthy();
    expect(screen.queryByText("first copy failed")).toBeNull();
  });

  it("cancels an export when the displayed record changes", async () => {
    let requestSignal: AbortSignal | undefined;
    mocks.readFullMessageJson.mockImplementation(
      async (_stream, _timeNs, signal) => {
        requestSignal = signal;
        await new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
        return "unreachable";
      },
    );

    const view = render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    await waitFor(() => expect(requestSignal).toBeDefined());

    mocks.recordState = {
      result: {
        ...DISPLAYED_RESULT,
        timestampNs: 20_000_000_000n,
        validFromNs: 20_000_000_000n,
        validUntilNs: 30_000_000_000n,
      },
      status: "ready",
    };
    view.rerender(<RawMessageTile />);

    await waitFor(() => expect(requestSignal?.aborted).toBe(true));
    expect(screen.getByRole("button", { name: "Copy message" })).toBeTruthy();
    expect(mocks.writeText).not.toHaveBeenCalled();
  });

  it("does not report copied after cancelling a pending clipboard write", async () => {
    let resolveWrite: (() => void) | undefined;
    mocks.readFullMessageJson.mockResolvedValue('{"data":7}');
    mocks.writeText.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );

    render(<RawMessageTile />);
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Cancel copy" }));

    expect(screen.getByRole("button", { name: "Copy message" })).toBeTruthy();
    resolveWrite?.();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Copied" })).toBeNull(),
    );
  });

  it("marks a retained record as stale while the latest target loads", () => {
    mocks.recordState = {
      result: DISPLAYED_RESULT,
      status: "loading",
      targetNs: 30_000_000_000n,
    };

    render(<RawMessageTile />);

    const staleNotice = screen.getByTestId("episode-raw-stale");
    const tree = screen.getByTestId("episode-raw-tree");
    const content = staleNotice.parentElement;

    expect(staleNotice.textContent).toMatch(/showing the previous result/);
    expect(content?.classList.contains(rawStyles.content)).toBe(true);
    expect(content?.contains(tree)).toBe(true);
  });

  it("offers numeric fields for a canonical stream id", () => {
    mocks.selectedStream = "7";
    mocks.streams = readyRawStreams("7");

    render(<RawMessageTile />);

    fireEvent.click(screen.getByTestId("episode-raw-plot-data.0"));
    expect(mocks.addFieldToPlot).toHaveBeenCalledWith("7", "data.0");
    expect(mocks.ensureEnumeration).not.toHaveBeenCalled();
    expect(mocks.setTileTitle).toHaveBeenCalledWith("/state", {
      source: "auto",
    });
  });

  it("does not inspect plot eligibility until a message row renders", () => {
    let hiddenNodeReads = 0;
    const hiddenNode: RawValueNode = {
      get kind() {
        hiddenNodeReads += 1;
        return "scalar" as const;
      },
      value: "100",
      valueType: "number",
    };
    const entries = Array.from(
      { length: 100 },
      (_, index) =>
        [
          `field-${index}`,
          { kind: "scalar", value: String(index), valueType: "number" },
        ] as const,
    );
    mocks.recordState = {
      result: {
        ...DISPLAYED_RESULT,
        root: {
          entries: [...entries, ["hidden", hiddenNode]],
          kind: "object",
        },
      },
      status: "ready",
    };

    render(<RawMessageTile />);

    expect(hiddenNodeReads).toBe(0);
    fireEvent.click(screen.getByTestId("episode-raw-show-more-$"));
    expect(hiddenNodeReads).toBeGreaterThan(0);
    expect(screen.getByTestId("episode-raw-plot-hidden")).toBeTruthy();
  });

  it("offers numeric fields for a legacy source-name binding", () => {
    mocks.selectedStream = "/state";

    render(<RawMessageTile />);

    fireEvent.click(screen.getByTestId("episode-raw-plot-data.0"));
    expect(mocks.addFieldToPlot).toHaveBeenCalledWith("/state", "data.0");
  });

  it("names a failed canonical binding by its source name", () => {
    mocks.selectedStream = "7";
    mocks.streams = readyRawStreams("7");
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

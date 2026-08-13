import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReadContinuation } from "../../../ports";
import type { TransformTopologyScanState } from "./transform-topology-context";
import TransformGraphTile from "./TransformGraphTile";

const mocks = vi.hoisted(() => ({
  analyzeMore: vi.fn(),
  canAnalyzeMore: true,
  capability: true,
  playbackTimeNs: 123n as bigint | undefined,
  retry: vi.fn(),
  setTileTitle: vi.fn(),
  state: {} as TransformTopologyScanState,
}));

vi.mock("@fiftyone/tiling", () => ({
  useSetTileTitle: () => mocks.setTileTitle,
}));

vi.mock("../playback/use-playback-time-ns", () => ({
  usePlaybackTimeNs: () => mocks.playbackTimeNs,
}));

vi.mock("./transform-topology-context", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./transform-topology-context")>();
  return {
    ...original,
    useTransformTopologyCapability: () => mocks.capability,
    useTransformTopologyScan: () => ({
      ...mocks.state,
      analyzeMore: mocks.analyzeMore,
      canAnalyzeMore: mocks.canAnalyzeMore,
      retry: mocks.retry,
    }),
  };
});

beforeEach(() => {
  mocks.analyzeMore.mockReset();
  mocks.canAnalyzeMore = true;
  mocks.capability = true;
  mocks.playbackTimeNs = 123n;
  mocks.retry.mockReset();
  mocks.setTileTitle.mockReset();
  mocks.state = partialState();
});

afterEach(cleanup);

describe("TransformGraphTile", () => {
  it("shows deterministic summary, partial coverage, and structural health", () => {
    render(<TransformGraphTile />);

    expect(screen.getByTestId("transform-graph-tile")).toBeTruthy();
    expect(screen.getByText("Components").parentElement?.textContent).toBe(
      "Components3",
    );
    expect(screen.getByText("Frames").parentElement?.textContent).toBe(
      "Frames6",
    );
    expect(screen.getByText("2 issues")).toBeTruthy();
    expect(screen.queryByText("Partial", { exact: true })).toBeNull();
    expect(screen.getByText("3 disconnected components")).toBeTruthy();
    expect(
      screen.getByText("Renderable streams are disconnected"),
    ).toBeTruthy();
    expect(screen.getByText("Likely frame-name mismatch")).toBeTruthy();
    expect(
      screen.getByText("Suggested spelling: lucid_cam_front_center"),
    ).toBeTruthy();
    expect(screen.getByText("Partial analysis")).toBeTruthy();
    expect(screen.queryByText(/108 messages/)).toBeNull();
    expect(mocks.analyzeMore).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Analyze more" }));
    expect(mocks.analyzeMore).toHaveBeenCalledWith(123n);
    expect(
      screen.queryByRole("button", { name: "Continue analysis" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add current time" }),
    ).toBeNull();
  });

  it("filters frames and exposes accessible frame and edge selection details", () => {
    render(<TransformGraphTile />);

    const toolbar = screen.getByLabelText("Transform graph controls");
    expect(
      within(toolbar).getByRole("searchbox", {
        name: "Filter transform frames",
      }),
    ).toBeTruthy();
    expect(
      within(toolbar).getByRole("button", { name: "Zoom out" }),
    ).toBeTruthy();
    expect(
      within(toolbar).getByRole("button", { name: "Zoom in" }),
    ).toBeTruthy();
    expect(
      within(toolbar)
        .getByRole("button", { name: "Fit transform graph" })
        .getAttribute("title"),
    ).toBe("Fit");
    expect(
      within(toolbar).queryByRole("button", {
        name: "Reset transform graph view",
      }),
    ).toBeNull();
    expect(
      within(screen.getByTestId("transform-topology-canvas")).queryByRole(
        "button",
        { name: "Zoom in" },
      ),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Frame lucid_cam/front_center" })
        .getAttribute("data-isolated"),
    ).toBe("true");
    fireEvent.click(
      screen.getByRole("button", { name: "Frame lucid_cam/front_center" }),
    );
    expect(
      within(screen.getByTestId("transform-selection-details")).queryByText(
        "None observed",
      ),
    ).toBeNull();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Filter transform frames" }),
      {
        target: { value: "lidar" },
      },
    );
    expect(screen.getByText("1 of 6")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Frame map" })
        .getAttribute("tabindex"),
    ).toBeNull();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Filter transform frames" }),
      { target: { value: "/tf_static" } },
    );
    expect(screen.getByText("4 of 6")).toBeTruthy();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Filter transform frames" }),
      { target: { value: "" } },
    );
    expect(
      screen.getByRole("application", {
        name: "Static transform topology",
      }),
    ).toBeTruthy();

    const mapFrame = screen.getByRole("button", { name: "Frame map" });
    expect(mapFrame.tagName).toBe("DIV");
    fireEvent.keyDown(mapFrame, { key: "Enter" });
    const frameDetails = screen.getByTestId("transform-selection-details");
    expect(within(frameDetails).queryByText("Renderable streams")).toBeNull();
    expect(within(frameDetails).queryByText("/oxts/odometry")).toBeNull();
    expect(within(frameDetails).getByText("Static · /tf_static")).toBeTruthy();
    expect(
      within(frameDetails).getByText("Component").parentElement?.textContent,
    ).toBe("Component1");

    const mapEdge = screen.getByRole("button", {
      name: "Transform edge map to base_link",
    });
    expect(
      mapEdge
        .querySelector(".react-flow__edge-path")
        ?.getAttribute("marker-end"),
    ).not.toContain("var(");
    fireEvent.keyDown(mapEdge, { key: " " });
    const edgeDetails = screen.getByTestId("transform-selection-details");
    expect(within(edgeDetails).getByText("Parent")).toBeTruthy();
    expect(within(edgeDetails).getByText("base_link")).toBeTruthy();
    expect(within(edgeDetails).getByText("Static")).toBeTruthy();
    expect(within(edgeDetails).getByText("/tf_static")).toBeTruthy();
  });

  it("renders loading, empty, error, and unavailable states honestly", () => {
    mocks.state = { ...emptyState(), loading: true, operation: "scan" };
    const { rerender } = render(<TransformGraphTile />);
    expect(screen.getByText("Reading transforms")).toBeTruthy();

    mocks.state = {
      ...emptyState(),
      status: "partial",
      stopReason: "oversized-source-unit",
      unavailableSpanCount: 4_489,
    };
    rerender(<TransformGraphTile />);
    expect(screen.getByText("More data needed")).toBeTruthy();
    expect(
      screen.getByText(
        "The initial bounded scan did not find enough transform data. Analyze more to continue the scan and include the current time.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/4,489/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add current time" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Analyze more" }));
    expect(mocks.analyzeMore).toHaveBeenCalledWith(123n);

    mocks.canAnalyzeMore = false;
    mocks.state = { ...emptyState(), status: "complete" };
    rerender(<TransformGraphTile />);
    expect(screen.getByText("No transform topology observed")).toBeTruthy();

    mocks.state = { ...emptyState(), error: "decoder unavailable" };
    rerender(<TransformGraphTile />);
    expect(screen.getByText("Transform analysis failed")).toBeTruthy();
    expect(screen.queryByText("decoder unavailable")).toBeNull();
    expect(
      screen.getByText("The transform data could not be read."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry bounded scan" }));
    expect(mocks.retry).toHaveBeenCalledOnce();

    mocks.capability = false;
    rerender(<TransformGraphTile />);
    expect(screen.getByText("Transform analysis unavailable")).toBeTruthy();
  });

  it("marks fully covered healthy topology complete", () => {
    mocks.state = {
      ...emptyState(),
      edges: [edge("map", "base_link", "static", "/tf_static")],
      frameUses: [{ frameId: "map", sourceName: "/odom", streamId: "odom" }],
      status: "complete",
      stopReason: "source-exhausted",
    };
    render(<TransformGraphTile />);

    expect(screen.getByText("Transform scan complete")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText("No structural issues observed")).toBeTruthy();
    expect(screen.queryByText("Component 1")).toBeNull();
    expect(
      screen.getByRole("group", { name: "Transform component" }),
    ).toBeTruthy();
    expect(screen.queryByTestId("transform-topology-partial")).toBeNull();
  });

  it("warns when the observed transform graph has multiple components", () => {
    mocks.state = {
      ...emptyState(),
      edges: [
        edge("map", "oxts", "static", "/tf_static"),
        edge("odom", "base_link", "temporal", "/tf"),
      ],
      status: "complete",
      stopReason: "source-exhausted",
    };
    render(<TransformGraphTile />);

    expect(screen.getByText("1 issue")).toBeTruthy();
    expect(screen.queryByText("Connected")).toBeNull();
    expect(screen.getByText("Transform graph is disconnected")).toBeTruthy();
    expect(screen.getByText("2 disconnected components")).toBeTruthy();
    expect(screen.getByText("Component 1")).toBeTruthy();
    expect(screen.getByText("Component 2")).toBeTruthy();
    expect(screen.queryByText(/data frames?/i)).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Frame map" })
        .getAttribute("data-isolated"),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Frame base_link" })
        .getAttribute("data-isolated"),
    ).toBeNull();
    expect(
      screen.getByText(/2 disconnected transform components were observed/),
    ).toBeTruthy();
    expect(screen.queryByText("No structural issues observed")).toBeNull();
  });

  it("keeps one partial-analysis label after adding time evidence", () => {
    mocks.state = {
      ...emptyState(),
      edges: [edge("map", "base_link", "temporal", "/tf")],
      sampledTimesNs: [123n],
      status: "partial",
      stopReason: "account-exhausted",
      unavailableSpanCount: 4_489,
      usage: { ...usage(), chunksOpened: 32, messagesDecoded: 99_999 },
    };
    render(<TransformGraphTile />);

    expect(screen.queryByText("Sampled", { exact: true })).toBeNull();
    expect(screen.queryByText("Sampled analysis")).toBeNull();
    expect(screen.getByText("Partial analysis")).toBeTruthy();
    expect(screen.queryByText(/budget limit reached/i)).toBeNull();
    expect(screen.queryByText(/99,999|4,489|oversized/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Analyze more" }));
    expect(mocks.analyzeMore).toHaveBeenCalledWith(123n);
  });

  it("keeps the combined action visible and disabled while analyzing", () => {
    mocks.state = {
      ...partialState(),
      loading: true,
      operation: "analyze",
    };
    render(<TransformGraphTile />);

    const button = screen.getByRole("button", { name: "Analyzing…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Partial analysis")).toBeTruthy();
  });
});

function partialState(): TransformTopologyScanState {
  return {
    ...emptyState(),
    continuation: { cursor: 1 } as ReadContinuation,
    edges: [
      edge("map", "base_link", "static", "/tf_static"),
      edge("base_link", "lidar", "temporal", "/tf"),
      edge("world", "lucid_cam_front_center", "static", "/tf_static"),
    ],
    frameUses: [
      { frameId: "map", sourceName: "/oxts/odometry", streamId: "odom" },
      { frameId: "lidar", sourceName: "/points", streamId: "points" },
      {
        frameId: "lucid_cam/front_center",
        sourceName: "/camera/front",
        streamId: "camera",
      },
    ],
    status: "partial",
    stopReason: "budget-exhausted",
    usage: { ...usage(), chunksOpened: 2, messagesDecoded: 108 },
  };
}

function emptyState(): TransformTopologyScanState {
  return {
    continuation: undefined,
    edges: [],
    error: null,
    frameUses: [],
    loading: false,
    operation: undefined,
    sampledRequestTimesNs: [],
    sampledTimesNs: [],
    scanCanProgress: true,
    status: "idle",
    stopReason: undefined,
    unavailableSpanCount: 0,
    usage: usage(),
  };
}

function edge(
  parentFrameId: string,
  childFrameId: string,
  kind: "static" | "temporal",
  sourceName: string,
) {
  return {
    childFrameId,
    firstObservedTimeNs: 1n,
    kind,
    lastObservedTimeNs: 2n,
    occurrenceCount: 2,
    parentFrameId,
    sourceName,
    sourceStreamId: sourceName,
  } as const;
}

function usage() {
  return {
    chunksOpened: 0,
    decompressedBytes: 0,
    decompressionCacheHits: 0,
    elapsedMs: 0,
    logicalSourceBytes: 0,
    logicalUncompressedBytes: 0,
    messagesDecoded: 0,
    transferredBytes: 0,
  };
}

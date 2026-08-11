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
  canSample: false,
  capability: true,
  continueAnalysis: vi.fn(),
  continueAnyway: vi.fn(),
  retry: vi.fn(),
  setTileTitle: vi.fn(),
  state: {} as TransformTopologyScanState,
}));

vi.mock("@fiftyone/tiling", () => ({
  useSetTileTitle: () => mocks.setTileTitle,
}));

vi.mock("./transform-topology-context", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./transform-topology-context")>();
  return {
    ...original,
    useTransformTopologyCapability: () => mocks.capability,
    useTransformTopologyScan: () => ({
      ...mocks.state,
      canSample: mocks.canSample,
      continueAnalysis: mocks.continueAnalysis,
      continueAnyway: mocks.continueAnyway,
      retry: mocks.retry,
    }),
  };
});

beforeEach(() => {
  mocks.canSample = false;
  mocks.capability = true;
  mocks.continueAnalysis.mockReset();
  mocks.continueAnyway.mockReset();
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
    expect(
      screen.getByText(/Data spans 2 disconnected components/),
    ).toBeTruthy();
    expect(
      screen.getByText("Renderable streams are disconnected"),
    ).toBeTruthy();
    expect(screen.getByText("Likely frame-name mismatch")).toBeTruthy();
    expect(
      screen.getByText("Suggested spelling: lucid_cam_front_center"),
    ).toBeTruthy();
    expect(screen.getByText("Partial analysis")).toBeTruthy();
    expect(screen.queryByText(/108 messages/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continue analysis" }));
    expect(mocks.continueAnalysis).toHaveBeenCalledOnce();
  });

  it("filters frames and exposes accessible frame and edge selection details", () => {
    render(<TransformGraphTile />);

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Filter transform frames" }),
      {
        target: { value: "lidar" },
      },
    );
    expect(screen.getByText("1 of 6")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Frame map" })).toBeNull();

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
      screen.getByRole("group", { name: "Static transform topology" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Frame map" }));
    const frameDetails = screen.getByTestId("transform-selection-details");
    expect(within(frameDetails).getByText("/oxts/odometry")).toBeTruthy();
    expect(within(frameDetails).getByText("Static · /tf_static")).toBeTruthy();
    expect(
      within(frameDetails).getByText("Component").parentElement?.textContent,
    ).toBe("Component1");

    fireEvent.click(
      screen.getByRole("button", { name: "Transform edge map to base_link" }),
    );
    const edgeDetails = screen.getByTestId("transform-selection-details");
    expect(within(edgeDetails).getByText("Parent")).toBeTruthy();
    expect(within(edgeDetails).getByText("base_link")).toBeTruthy();
    expect(within(edgeDetails).getByText("Static")).toBeTruthy();
    expect(within(edgeDetails).getByText("/tf_static")).toBeTruthy();
  });

  it("renders loading, empty, error, and unavailable states honestly", () => {
    mocks.state = { ...emptyState(), loading: true };
    const { rerender } = render(<TransformGraphTile />);
    expect(screen.getByText("Reading transforms")).toBeTruthy();

    mocks.canSample = true;
    mocks.state = {
      ...emptyState(),
      partial: true,
      stopReason: "oversized-source-unit",
      unavailableSpanCount: 4_489,
    };
    rerender(<TransformGraphTile />);
    expect(screen.getByText("More data needed")).toBeTruthy();
    expect(
      screen.getByText(
        "We scanned a tiny bit of your episode but looks like we need to sample more transform data to build this view",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/4,489/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Continue analysis" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue anyway" }));
    expect(mocks.continueAnyway).toHaveBeenCalledOnce();

    mocks.canSample = false;
    mocks.state = { ...emptyState(), complete: true };
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
      complete: true,
      edges: [edge("map", "base_link", "static", "/tf_static")],
      frameUses: [{ frameId: "map", sourceName: "/odom", streamId: "odom" }],
      stopReason: "source-exhausted",
    };
    render(<TransformGraphTile />);

    expect(screen.getByText("Complete")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText("No structural issues observed")).toBeTruthy();
    expect(screen.queryByTestId("transform-topology-partial")).toBeNull();
  });

  it("labels an explicitly sampled graph without exposing read details", () => {
    mocks.state = {
      ...emptyState(),
      edges: [edge("map", "base_link", "temporal", "/tf")],
      partial: true,
      sampled: true,
      stopReason: "oversized-source-unit",
      unavailableSpanCount: 4_489,
      usage: { ...usage(), chunksOpened: 32, messagesDecoded: 99_999 },
    };
    render(<TransformGraphTile />);

    expect(screen.queryByText("Sampled", { exact: true })).toBeNull();
    expect(screen.getByText("Sampled analysis")).toBeTruthy();
    expect(screen.queryByText(/99,999|4,489|oversized/i)).toBeNull();
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
    partial: true,
    stopReason: "budget-exhausted",
    usage: { ...usage(), chunksOpened: 2, messagesDecoded: 108 },
  };
}

function emptyState(): TransformTopologyScanState {
  return {
    complete: false,
    edges: [],
    error: null,
    frameUses: [],
    loading: false,
    partial: false,
    sampled: false,
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

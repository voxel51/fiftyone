import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ReadContinuation,
  TransformTopologyCapability,
  TransformTopologyScanResult,
} from "../../../ports";
import {
  TRANSFORM_TOPOLOGY_GRANT_BUDGET,
  TransformTopologyProvider,
  useTransformTopologyScan,
} from "./transform-topology-context";

afterEach(cleanup);

describe("TransformTopologyProvider", () => {
  it("does no work until a scan consumer mounts", () => {
    const capability = createCapability();
    render(
      <TransformTopologyProvider
        capability={capability}
        sourceKey="recording-a"
      >
        <div>inventory only</div>
      </TransformTopologyProvider>,
    );

    expect(capability.scan).not.toHaveBeenCalled();
  });

  it("starts exactly one modest grant and never auto-continues", async () => {
    const continuation = { cursor: 1 } as ReadContinuation;
    const capability = createCapability(
      vi.fn<TransformTopologyCapability["scan"]>(() =>
        Promise.resolve(
          result({ continuation, stopReason: "budget-exhausted" }),
        ),
      ),
    );

    renderHarness(capability);

    await waitFor(() => expect(capability.scan).toHaveBeenCalledOnce());
    const request = vi.mocked(capability.scan).mock.calls[0]?.[0];
    expect(request).toMatchObject({
      budget: TRANSFORM_TOPOLOGY_GRANT_BUDGET,
      continuation: undefined,
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    expect(await screen.findByText("partial")).toBeTruthy();
    await act(async () => Promise.resolve());
    expect(capability.scan).toHaveBeenCalledOnce();
  });

  it("merges only new current-time evidence into partial scan topology", async () => {
    let completedScanSignal: AbortSignal | undefined;
    const scan = vi.fn<TransformTopologyCapability["scan"]>((request) => {
      completedScanSignal = request.signal;
      return Promise.resolve(
        result({
          continuation: { cursor: 1 } as ReadContinuation,
          edges: [edge("map", "base_link", "temporal", "/tf", 7)],
          frameUses: [frameUse("map", "odom")],
          stopReason: "budget-exhausted",
        }),
      );
    });
    const sample = vi.fn<NonNullable<TransformTopologyCapability["sample"]>>(
      (request) =>
        Promise.resolve({
          edges: [
            edge("map", "base_link", "temporal", "/tf"),
            edge("map", "base_link", "static", "/tf_static"),
            edge("base_link", "lidar", "temporal", "/tf"),
          ],
          frameUses: [frameUse("lidar", "points")],
          sampledAtNs: request.timeNs,
        }),
    );

    renderHarness({ sample, scan });
    await screen.findByText("partial");
    expect(sample).not.toHaveBeenCalled();
    expect(scan).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "sample at 5" }));

    await waitFor(() =>
      expect(screen.getByTestId("edges").textContent).toBe(
        "map>base_link:temporal:/tf:7,map>base_link:static:/tf_static:1,base_link>lidar:temporal:/tf:1",
      ),
    );
    expect(screen.getByText("partial")).toBeTruthy();
    expect(completedScanSignal?.aborted).toBe(false);
    const sampleRequest = sample.mock.calls[0]?.[0];
    expect(sampleRequest).toMatchObject({
      timeNs: 5n,
    });
    expect(sampleRequest?.signal).toBeInstanceOf(AbortSignal);
    expect(scan).toHaveBeenCalledOnce();
    expect(screen.getByTestId("frame-uses").textContent).toBe(
      "lidar:points,map:odom",
    );

    fireEvent.click(screen.getByRole("button", { name: "sample at 9" }));
    await waitFor(() =>
      expect(screen.getByTestId("sample-loading").textContent).toBe("idle"),
    );
    expect(sample).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("edges").textContent).toBe(
      "map>base_link:temporal:/tf:7,map>base_link:static:/tf_static:1,base_link>lidar:temporal:/tf:1",
    );
  });

  it("keeps earlier point-in-time topology when sampling again", async () => {
    const scan = vi.fn<TransformTopologyCapability["scan"]>(() =>
      Promise.resolve(result({ stopReason: "oversized-source-unit" })),
    );
    const sample = vi.fn<NonNullable<TransformTopologyCapability["sample"]>>(
      (request) =>
        Promise.resolve({
          edges:
            request.timeNs === 5n
              ? [edge("map", "base_link", "temporal", "/tf")]
              : [edge("world", "camera", "static", "/tf_static")],
          frameUses:
            request.timeNs === 5n ? [] : [frameUse("camera", "front-camera")],
          sampledAtNs: request.timeNs,
        }),
    );

    renderHarness({ sample, scan });
    await screen.findByText("partial");
    fireEvent.click(screen.getByRole("button", { name: "sample at 5" }));

    expect(await screen.findByText("sampled")).toBeTruthy();
    expect(screen.getByTestId("edges").textContent).toBe(
      "map>base_link:temporal:/tf:1",
    );

    fireEvent.click(screen.getByRole("button", { name: "sample at 9" }));
    await waitFor(() =>
      expect(screen.getByTestId("edges").textContent).toBe(
        "map>base_link:temporal:/tf:1,world>camera:static:/tf_static:1",
      ),
    );
    expect(screen.getByTestId("frame-uses").textContent).toBe(
      "camera:front-camera",
    );
  });

  it("stays partial when a source-exhausted scan skipped source spans", async () => {
    const capability = createCapability(
      vi.fn<TransformTopologyCapability["scan"]>(() =>
        Promise.resolve(
          result({
            unavailableByStream: new Map([
              ["tf", [{ endNs: 2n, startNs: 1n }]],
            ]),
          }),
        ),
      ),
    );

    renderHarness(capability);

    expect(await screen.findByText("partial")).toBeTruthy();
  });

  it("cancels an in-flight grant when the source changes", async () => {
    let firstSignal: AbortSignal | undefined;
    const scan = vi.fn<TransformTopologyCapability["scan"]>((request) => {
      firstSignal ??= request.signal;
      return new Promise(() => undefined);
    });
    const capability: TransformTopologyCapability = { scan };
    const { rerender } = render(
      <TransformTopologyProvider
        capability={capability}
        sourceKey="recording-a"
      >
        <Probe />
      </TransformTopologyProvider>,
    );
    await waitFor(() => expect(scan).toHaveBeenCalledOnce());

    rerender(
      <TransformTopologyProvider
        capability={capability}
        sourceKey="recording-b"
      >
        <Probe />
      </TransformTopologyProvider>,
    );

    await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);
  });
});

function Probe() {
  const state = useTransformTopologyScan();
  return (
    <div>
      <span>
        {state.sampled
          ? "sampled"
          : state.complete
            ? `complete:${state.usage.messagesDecoded}`
            : state.partial
              ? "partial"
              : state.loading
                ? "loading"
                : "idle"}
      </span>
      <span data-testid="frame-uses">
        {state.frameUses
          .map((use) => `${use.frameId}:${use.streamId}`)
          .join(",")}
      </span>
      <span data-testid="edges">
        {state.edges
          .map(
            (edge) =>
              `${edge.parentFrameId}>${edge.childFrameId}:${edge.kind}:${edge.sourceName}:${edge.occurrenceCount}`,
          )
          .join(",")}
      </span>
      <span data-testid="sample-loading">
        {state.loading ? "loading" : "idle"}
      </span>
      <button onClick={() => state.sampleCurrentTime(5n)} type="button">
        sample at 5
      </button>
      <button onClick={() => state.sampleCurrentTime(9n)} type="button">
        sample at 9
      </button>
    </div>
  );
}

function renderHarness(capability: TransformTopologyCapability) {
  return render(
    <TransformTopologyProvider capability={capability} sourceKey="recording-a">
      <Probe />
    </TransformTopologyProvider>,
  );
}

function createCapability(
  scan: TransformTopologyCapability["scan"] = vi.fn<
    TransformTopologyCapability["scan"]
  >(() => Promise.resolve(result({ stopReason: "source-exhausted" }))),
): TransformTopologyCapability {
  return { scan };
}

function result(
  overrides: Partial<TransformTopologyScanResult>,
): TransformTopologyScanResult {
  return {
    coverageByStream: new Map(),
    edges: [],
    frameUses: [],
    stopReason: "source-exhausted",
    usage: usage(),
    ...overrides,
  };
}

function frameUse(frameId: string, streamId: string) {
  return { frameId, sourceName: `/${streamId}`, streamId };
}

function edge(
  parentFrameId: string,
  childFrameId: string,
  kind: "static" | "temporal",
  sourceName: string,
  occurrenceCount = 1,
) {
  return {
    childFrameId,
    kind,
    occurrenceCount,
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

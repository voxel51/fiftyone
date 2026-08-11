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
      vi.fn(async () =>
        result({ continuation, stopReason: "budget-exhausted" }),
      ),
    );

    renderHarness(capability);

    await waitFor(() => expect(capability.scan).toHaveBeenCalledOnce());
    expect(capability.scan).toHaveBeenCalledWith({
      budget: TRANSFORM_TOPOLOGY_GRANT_BUDGET,
      continuation: undefined,
      signal: expect.any(AbortSignal),
    });
    expect(await screen.findByText("partial")).toBeTruthy();
    await act(async () => Promise.resolve());
    expect(capability.scan).toHaveBeenCalledOnce();
  });

  it("continues only after explicit user action and merges usage", async () => {
    const continuation = { cursor: 1 } as ReadContinuation;
    const scan = vi
      .fn<TransformTopologyCapability["scan"]>()
      .mockResolvedValueOnce(
        result({
          continuation,
          frameUses: [frameUse("map", "odom")],
          stopReason: "budget-exhausted",
          usage: { ...usage(), messagesDecoded: 7 },
        }),
      )
      .mockResolvedValueOnce(
        result({
          frameUses: [frameUse("lidar", "points")],
          stopReason: "source-exhausted",
          usage: { ...usage(), messagesDecoded: 5 },
        }),
      );

    renderHarness({ scan });
    await screen.findByText("partial");
    fireEvent.click(screen.getByRole("button", { name: "continue" }));

    await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
    expect(scan.mock.calls[1]?.[0].continuation).toBe(continuation);
    expect(await screen.findByText("complete:12")).toBeTruthy();
    expect(screen.getByTestId("frame-uses").textContent).toBe(
      "lidar:points,map:odom",
    );
    fireEvent.click(screen.getByRole("button", { name: "continue" }));
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("uses a targeted sample only after an explicit fallback action", async () => {
    let completedScanSignal: AbortSignal | undefined;
    const scan = vi.fn<TransformTopologyCapability["scan"]>(async (request) => {
      completedScanSignal = request.signal;
      return result({
        frameUses: [frameUse("stale", "camera")],
        stopReason: "oversized-source-unit",
      });
    });
    const sample = vi.fn<NonNullable<TransformTopologyCapability["sample"]>>(
      async () => ({
        edges: [
          {
            childFrameId: "base_link",
            kind: "temporal",
            occurrenceCount: 1,
            parentFrameId: "map",
            sourceName: "/tf",
            sourceStreamId: "tf",
          },
        ],
        frameUses: [],
        sampledAtNs: 5n,
      }),
    );

    renderHarness({ sample, scan });
    await screen.findByText("partial");
    expect(sample).not.toHaveBeenCalled();
    expect(scan).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "continue anyway" }));

    expect(await screen.findByText("sampled")).toBeTruthy();
    expect(completedScanSignal?.aborted).toBe(false);
    expect(sample).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    expect(scan).toHaveBeenCalledOnce();
    expect(screen.getByTestId("frame-uses").textContent).toBe("");
  });

  it("stays partial when a source-exhausted scan skipped source spans", async () => {
    const capability = createCapability(
      vi.fn(async () =>
        result({
          unavailableByStream: new Map([["tf", [{ endNs: 2n, startNs: 1n }]]]),
        }),
      ),
    );

    renderHarness(capability);

    expect(await screen.findByText("partial")).toBeTruthy();
  });

  it("retains unavailable spans from an earlier continuation", async () => {
    const continuation = { cursor: 2 } as ReadContinuation;
    const scan = vi
      .fn<TransformTopologyCapability["scan"]>()
      .mockResolvedValueOnce(
        result({
          continuation,
          stopReason: "budget-exhausted",
          unavailableByStream: new Map([["tf", [{ endNs: 2n, startNs: 1n }]]]),
        }),
      )
      .mockResolvedValueOnce(result({ stopReason: "source-exhausted" }));

    renderHarness({ scan });
    await screen.findByText("partial");
    fireEvent.click(screen.getByRole("button", { name: "continue" }));

    await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
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
      <button onClick={state.continueAnalysis} type="button">
        continue
      </button>
      <button onClick={state.continueAnyway} type="button">
        continue anyway
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
  scan: TransformTopologyCapability["scan"] = vi.fn(async () =>
    result({ stopReason: "source-exhausted" }),
  ),
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

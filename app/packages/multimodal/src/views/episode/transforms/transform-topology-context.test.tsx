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
  MAX_STORES_PER_CAPABILITY,
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

  it("starts one bounded grant and waits for explicit continuation", async () => {
    const continuation = { cursor: 1 } as ReadContinuation;
    const capability = createCapability(
      vi.fn(async () =>
        result({ continuation, stopReason: "budget-exhausted" }),
      ),
    );

    renderHarness(capability);

    expect((await screen.findByTestId("status")).textContent).toBe("partial");
    expect(capability.scan).toHaveBeenCalledOnce();
    expect(capability.scan).toHaveBeenCalledWith({
      budget: TRANSFORM_TOPOLOGY_GRANT_BUDGET,
      signal: expect.any(AbortSignal),
    });
    await act(async () => Promise.resolve());
    expect(capability.scan).toHaveBeenCalledOnce();
  });

  it("authorizes another bounded grant after the initial account is exhausted", async () => {
    const continuation = { cursor: 1 } as ReadContinuation;
    const nextContinuation = { cursor: 2 } as ReadContinuation;
    const scan = vi
      .fn<TransformTopologyCapability["scan"]>()
      .mockResolvedValueOnce(
        result({ continuation, stopReason: "account-exhausted" }),
      )
      .mockResolvedValueOnce(
        result({
          continuation: nextContinuation,
          edges: [edge("map", "base_link", "temporal", "/tf")],
          stopReason: "budget-exhausted",
          usage: usage(1),
        }),
      );
    renderHarness({ scan });
    await screen.findByText("partial");

    fireEvent.click(
      screen.getByRole("button", { name: "analyze without time" }),
    );

    await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("edges").textContent).toBe(
      "map>base_link:temporal:/tf:1",
    );
    expect(screen.getByTestId("can-analyze").textContent).toBe("yes");
  });

  it("stops scan advancement after an explicit grant makes no progress", async () => {
    const continuation = { cursor: 1 } as ReadContinuation;
    const scan = vi.fn<TransformTopologyCapability["scan"]>(async () =>
      result({ continuation, stopReason: "account-exhausted" }),
    );
    renderHarness({ scan });
    await screen.findByText("partial");
    expect(screen.getByTestId("can-analyze").textContent).toBe("yes");

    fireEvent.click(
      screen.getByRole("button", { name: "analyze without time" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("can-analyze").textContent).toBe("no"),
    );
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("continues before sampling and never repeats the same time sample", async () => {
    const operations: string[] = [];
    const scan = vi.fn<TransformTopologyCapability["scan"]>(async () => {
      operations.push("scan");
      return result({
        continuation: { cursor: 1 } as ReadContinuation,
        edges: [edge("map", "base_link", "temporal", "/tf", 7)],
        frameUses: [frameUse("map", "odom")],
        stopReason: "budget-exhausted",
      });
    });
    const sample = vi.fn<NonNullable<TransformTopologyCapability["sample"]>>(
      async (request) => {
        operations.push("sample");
        return {
          edges: [
            edge("map", "base_link", "temporal", "/tf"),
            edge("map", "base_link", "static", "/tf_static"),
            edge("base_link", "lidar", "temporal", "/tf"),
          ],
          frameUses: [frameUse("lidar", "points")],
          sampledAtNs: request.timeNs,
        };
      },
    );

    renderHarness({ sample, scan });
    await screen.findByText("partial");
    fireEvent.click(screen.getByRole("button", { name: "analyze at 5" }));

    await waitFor(() =>
      expect(screen.getByTestId("edges").textContent).toBe(
        "map>base_link:temporal:/tf:14,map>base_link:static:/tf_static:1,base_link>lidar:temporal:/tf:1",
      ),
    );
    expect(screen.getByTestId("status").textContent).toBe("partial");
    expect(screen.getByTestId("sampled-times").textContent).toBe("5");
    expect(screen.getByTestId("frame-uses").textContent).toBe(
      "lidar:points,map:odom",
    );
    expect(operations).toEqual(["scan", "scan", "sample"]);

    fireEvent.click(screen.getByRole("button", { name: "analyze at 5" }));
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(3));
    expect(sample).toHaveBeenCalledOnce();
    expect(screen.getByTestId("edges").textContent).toContain(
      "map>base_link:temporal:/tf:21",
    );
  });

  it("resumes the stored continuation and accumulates only scan usage", async () => {
    const continuation = { cursor: 1 } as ReadContinuation;
    const scan = vi
      .fn<TransformTopologyCapability["scan"]>()
      .mockResolvedValueOnce(
        result({
          continuation,
          edges: [edge("map", "base_link", "temporal", "/tf", 4)],
          stopReason: "budget-exhausted",
          usage: usage(2),
        }),
      )
      .mockResolvedValueOnce(
        result({
          edges: [edge("map", "base_link", "temporal", "/tf", 6)],
          stopReason: "source-exhausted",
          usage: usage(3),
        }),
      );

    renderHarness({ scan });
    await screen.findByText("partial");
    fireEvent.click(
      screen.getByRole("button", { name: "analyze without time" }),
    );

    expect(await screen.findByText("complete:5")).toBeTruthy();
    expect(screen.getByTestId("edges").textContent).toBe(
      "map>base_link:temporal:/tf:10",
    );
    expect(scan).toHaveBeenLastCalledWith({
      budget: TRANSFORM_TOPOLOGY_GRANT_BUDGET,
      continuation,
      signal: expect.any(AbortSignal),
    });
  });

  it("samples when no continuation is available", async () => {
    const scan = vi.fn<TransformTopologyCapability["scan"]>(async () =>
      result({ stopReason: "oversized-source-unit" }),
    );
    const sample = vi.fn<NonNullable<TransformTopologyCapability["sample"]>>(
      async (request) => ({
        edges: [edge("map", "base_link", "static", "/tf_static")],
        frameUses: [],
        sampledAtNs: request.timeNs,
      }),
    );
    renderHarness({ sample, scan });
    await screen.findByText("partial");

    fireEvent.click(screen.getByRole("button", { name: "analyze at 5" }));

    await waitFor(() => expect(sample).toHaveBeenCalledOnce());
    expect(scan).toHaveBeenCalledOnce();
    expect(screen.getByTestId("can-analyze").textContent).toBe("no");
    expect(screen.getByTestId("edges").textContent).toBe(
      "map>base_link:static:/tf_static:1",
    );
  });

  it("reuses completed grants and evidence across panel remounts", async () => {
    const continuation = { cursor: 1 } as ReadContinuation;
    const capability = createCapability(
      vi.fn(async () =>
        result({
          continuation,
          edges: [edge("map", "base_link", "static", "/tf_static")],
          stopReason: "budget-exhausted",
        }),
      ),
    );
    const first = renderHarness(capability);
    await screen.findByText("partial");
    first.unmount();

    renderHarness(capability);

    expect(await screen.findByText("partial")).toBeTruthy();
    expect(screen.getByTestId("edges").textContent).toBe(
      "map>base_link:static:/tf_static:1",
    );
    expect(capability.scan).toHaveBeenCalledOnce();
  });

  it("lets an in-flight bounded grant finish while the panel is unmounted", async () => {
    let resolveScan: ((value: TransformTopologyScanResult) => void) | undefined;
    const scan = vi.fn<TransformTopologyCapability["scan"]>(
      () =>
        new Promise((resolve) => {
          resolveScan = resolve;
        }),
    );
    const capability = { scan };
    const first = renderHarness(capability);
    await waitFor(() => expect(scan).toHaveBeenCalledOnce());
    first.unmount();

    await act(async () => {
      resolveScan?.(
        result({
          continuation: { cursor: 1 } as ReadContinuation,
          stopReason: "budget-exhausted",
        }),
      );
    });
    renderHarness(capability);

    expect(await screen.findByText("partial")).toBeTruthy();
    expect(scan).toHaveBeenCalledOnce();
  });

  it("keeps different sources isolated within one session", async () => {
    const scan = vi.fn<TransformTopologyCapability["scan"]>(async () =>
      result({ stopReason: "source-exhausted" }),
    );
    const capability = { scan };
    const view = renderHarness(capability, "recording-a");
    await screen.findByText("complete:0");

    view.rerender(
      <TransformTopologyProvider
        capability={capability}
        sourceKey="recording-b"
      >
        <Probe />
      </TransformTopologyProvider>,
    );

    await waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
  });

  it("bounds retained source stores per session", async () => {
    const scan = vi.fn<TransformTopologyCapability["scan"]>(async () =>
      result({ stopReason: "source-exhausted" }),
    );
    const capability = { scan };
    const view = renderHarness(capability, "recording-0");
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));

    for (let index = 1; index <= MAX_STORES_PER_CAPABILITY; index += 1) {
      view.rerender(
        <TransformTopologyProvider
          capability={capability}
          sourceKey={`recording-${index}`}
        >
          <Probe />
        </TransformTopologyProvider>,
      );
      await waitFor(() => expect(scan).toHaveBeenCalledTimes(index + 1));
    }

    view.rerender(
      <TransformTopologyProvider
        capability={capability}
        sourceKey="recording-0"
      >
        <Probe />
      </TransformTopologyProvider>,
    );
    await waitFor(() =>
      expect(scan).toHaveBeenCalledTimes(MAX_STORES_PER_CAPABILITY + 2),
    );
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
});

function Probe() {
  const state = useTransformTopologyScan(5n);
  return (
    <div>
      <span data-testid="status">
        {state.status === "complete"
          ? `complete:${state.usage.messagesDecoded}`
          : state.status}
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
      <span data-testid="sampled-times">
        {state.sampledTimesNs.map(String).join(",")}
      </span>
      <span data-testid="can-analyze">
        {state.canAnalyzeMore ? "yes" : "no"}
      </span>
      <button onClick={() => state.analyzeMore(undefined)} type="button">
        analyze without time
      </button>
      <button onClick={() => state.analyzeMore(5n)} type="button">
        analyze at 5
      </button>
    </div>
  );
}

function renderHarness(
  capability: TransformTopologyCapability,
  sourceKey = "recording-a",
) {
  return render(
    <TransformTopologyProvider capability={capability} sourceKey={sourceKey}>
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

function usage(messagesDecoded = 0) {
  return {
    chunksOpened: 0,
    decompressedBytes: 0,
    decompressionCacheHits: 0,
    elapsedMs: 0,
    logicalSourceBytes: 0,
    logicalUncompressedBytes: 0,
    messagesDecoded,
    transferredBytes: 0,
  };
}

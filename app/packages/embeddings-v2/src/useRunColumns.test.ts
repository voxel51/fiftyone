// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  fetchGeometry,
  fetchIds,
  fetchRunInfo,
  type Geometry,
  type RunInfo,
  type Slice,
} from "./protocol";
import { CHUNK, useRunColumns } from "./useRunColumns";

vi.mock("@fiftyone/utilities", () => ({
  getFetchFunction: () => {
    throw new Error("network use in a unit test");
  },
}));
vi.mock("./protocol", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./protocol")>()),
  fetchRunInfo: vi.fn(),
  fetchGeometry: vi.fn(),
  fetchIds: vi.fn(),
}));

const info = (n: number): RunInfo => ({
  brainKey: "viz",
  method: null,
  dims: 2,
  patchesField: null,
  pointsField: null,
  model: null,
  ready: true,
  error: null,
  timestamp: null,
  n,
});

const geometry = (slice?: Slice): Geometry => {
  const n = slice?.limit ?? 0;
  return { n, columns: [new Float32Array(n), new Float32Array(n)] };
};

const arm = (n: number) => {
  vi.mocked(fetchRunInfo).mockResolvedValue(info(n));
  vi.mocked(fetchGeometry).mockImplementation(async (_d, _b, slice) =>
    geometry(slice),
  );
  vi.mocked(fetchIds).mockImplementation(
    async (_d, _b, slice) => new Uint8Array((slice?.limit ?? 0) * 12),
  );
};

describe("useRunColumns", () => {
  it("assembles a multi-chunk run in wire-order slices", async () => {
    const total = 2 * CHUNK + 50_000;
    arm(total);
    const { result } = renderHook(() => useRunColumns("ds", "viz"));

    await waitFor(
      () => expect(result.current.loaded?.points.length).toBe(total),
      { timeout: 10_000 },
    );

    expect(result.current.loaded?.total).toBe(total);
    expect(result.current.loaded?.ids.length).toBe(total * 12);
    expect(vi.mocked(fetchGeometry).mock.calls.map(([, , s]) => s)).toEqual([
      { offset: 0, limit: CHUNK },
      { offset: CHUNK, limit: CHUNK },
      { offset: 2 * CHUNK, limit: 50_000 },
    ]);
  }, 15_000);

  it("abandons an in-flight run when the key changes", async () => {
    let releaseFirst!: (value: RunInfo) => void;
    vi.mocked(fetchRunInfo)
      .mockImplementationOnce(
        () => new Promise<RunInfo>((res) => (releaseFirst = res)),
      )
      .mockImplementationOnce(async () => ({ ...info(5), brainKey: "b" }));
    vi.mocked(fetchGeometry).mockImplementation(async (_d, _b, slice) =>
      geometry(slice),
    );
    vi.mocked(fetchIds).mockImplementation(
      async (_d, _b, slice) => new Uint8Array((slice?.limit ?? 0) * 12),
    );

    const { result, rerender } = renderHook(
      ({ brainKey }: { brainKey: string }) => useRunColumns("ds", brainKey),
      { initialProps: { brainKey: "a" } },
    );
    rerender({ brainKey: "b" });

    await waitFor(() => expect(result.current.loaded?.brainKey).toBe("b"));

    // Run a resolves late; nothing of it may publish
    releaseFirst(info(9));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.loaded?.brainKey).toBe("b");
    expect(result.current.loaded?.points.length).toBe(5);
  });

  it("reports a failed load and releases the in-flight guard", async () => {
    vi.mocked(fetchRunInfo).mockRejectedValue(new Error("cold cache"));
    const { result } = renderHook(() => useRunColumns("ds", "viz"));

    await waitFor(() => expect(result.current.error).toMatch("cold cache"));
    expect(result.current.loaded).toBeNull();
  });

  // No chunks means no publishes — the empty run must still resolve or
  // the loading spinner never leaves
  it("publishes an empty run immediately", async () => {
    vi.mocked(fetchRunInfo).mockResolvedValue(info(0));
    vi.mocked(fetchGeometry).mockClear();
    const { result } = renderHook(() => useRunColumns("ds", "empty"));

    await waitFor(() => expect(result.current.loaded).not.toBeNull());
    expect(result.current.loaded?.points).toEqual([]);
    expect(result.current.loaded?.total).toBe(0);
    expect(fetchGeometry).not.toHaveBeenCalled();
  });

  it("does nothing without a run selected", () => {
    vi.mocked(fetchRunInfo).mockClear();
    renderHook(() => useRunColumns("ds", null));
    expect(fetchRunInfo).not.toHaveBeenCalled();
  });
});

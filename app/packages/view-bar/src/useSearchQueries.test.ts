import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  const queries = vi.fn();
  const extensions = new Map<string, Record<string, unknown>>([
    ["multimodal", { method: "multimodal", search: vi.fn(), queries }],
    ["plain", { method: "plain", search: vi.fn() }],
  ]);
  return { queries, extensions };
});

vi.mock("@fiftyone/state", () => ({
  useCurrentDatasetName: () => "robots",
  useTextSearchExtensions: () => env.extensions,
}));

import { useSearchQueries } from "./useSearchQueries";

const index = (key: string, extension = "multimodal") => ({
  key,
  patchesField: null,
  extension,
  timestamp: null,
});

describe("useSearchQueries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("leaves an extension without queries unrestricted", () => {
    const { result } = renderHook(() =>
      useSearchQueries(index("emb_sim", "plain"), 0),
    );
    expect(result.current).toBeNull();
  });

  it("allows nothing until the extension answers", async () => {
    let answer: (value: {
      queries: string[];
      freeText: boolean;
    }) => void = () => undefined;
    env.queries.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { result } = renderHook(() => useSearchQueries(index("emb_sim"), 0));
    expect(result.current).toMatchObject({
      queries: [],
      freeText: false,
      loading: true,
    });

    answer({ queries: ["a robot arm"], freeText: true });
    await waitFor(() =>
      expect(result.current).toMatchObject({
        queries: ["a robot arm"],
        freeText: true,
        loading: false,
      }),
    );
  });

  it("never shows another index's queries", async () => {
    env.queries.mockImplementation(({ brainKey }: { brainKey: string }) =>
      brainKey === "first"
        ? Promise.resolve({ queries: ["a robot arm"], freeText: false })
        : new Promise(() => undefined),
    );
    const { result, rerender } = renderHook(
      ({ key }) => useSearchQueries(index(key), 0),
      { initialProps: { key: "first" } },
    );
    await waitFor(() => expect(result.current?.loading).toBe(false));

    rerender({ key: "second" });
    expect(result.current).toMatchObject({ queries: [], loading: true });
  });

  it("reads the queries again when asked", async () => {
    env.queries
      .mockResolvedValueOnce({ queries: ["a robot arm"], freeText: false })
      .mockResolvedValueOnce({
        queries: ["a robot arm", "a red cup"],
        freeText: false,
      });
    const { result, rerender } = renderHook(
      ({ readCount }) => useSearchQueries(index("emb_sim"), readCount),
      { initialProps: { readCount: 0 } },
    );
    await waitFor(() =>
      expect(result.current?.queries).toEqual(["a robot arm"]),
    );

    rerender({ readCount: 1 });
    await waitFor(() =>
      expect(result.current?.queries).toEqual(["a robot arm", "a red cup"]),
    );
  });

  it("allows nothing when the extension cannot say", async () => {
    env.queries.mockRejectedValue(new Error("unreachable"));
    const { result } = renderHook(() => useSearchQueries(index("emb_sim"), 0));
    await waitFor(() => expect(result.current?.loading).toBe(false));
    expect(result.current).toMatchObject({ queries: [], freeText: false });
  });
});

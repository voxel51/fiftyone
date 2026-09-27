import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  const loadSuggestions = vi.fn();
  const extensions = new Map<string, Record<string, unknown>>([
    ["multimodal", { method: "multimodal", search: vi.fn(), loadSuggestions }],
    ["plain", { method: "plain", search: vi.fn() }],
  ]);
  return { loadSuggestions, extensions };
});

vi.mock("@fiftyone/state", () => ({
  useCurrentDatasetName: () => "robots",
  useTextSearchExtensions: () => env.extensions,
}));

import { useSearchSuggestions } from "./useSearchSuggestions";

const index = (key: string, extension = "multimodal") => ({
  key,
  patchesField: null,
  extension,
  timestamp: null,
});

const NO_HISTORY: string[] = [];

// Prompts only the index can run
const offering = (prompts: string[]) => ({ prompts, freeText: false });

describe("useSearchSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("leaves an extension without suggestions unrestricted", () => {
    const { result } = renderHook(() =>
      useSearchSuggestions(index("emb_sim", "plain"), "", NO_HISTORY, 1),
    );
    expect(result.current).toBeNull();
  });

  it("loads nothing before the list first opens", () => {
    const { result } = renderHook(() =>
      useSearchSuggestions(index("emb_sim"), "", NO_HISTORY, 0),
    );
    expect(env.loadSuggestions).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ mode: "pending", loading: false });
  });

  it("runs nothing until the suggestions load", () => {
    env.loadSuggestions.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() =>
      useSearchSuggestions(index("emb_sim"), "", NO_HISTORY, 1),
    );
    expect(result.current).toMatchObject({
      mode: "pending",
      prompts: [],
      loading: true,
    });
  });

  it("matches every keystroke against one load", async () => {
    env.loadSuggestions.mockResolvedValue(
      offering(["a robot arm", "a red cup"]),
    );
    const { result, rerender } = renderHook(
      ({ query }) =>
        useSearchSuggestions(index("emb_sim"), query, NO_HISTORY, 1),
      { initialProps: { query: "a r" } },
    );
    await waitFor(() => expect(result.current?.mode).toBe("offered"));
    expect(result.current?.prompts).toEqual(["a robot arm", "a red cup"]);

    rerender({ query: "A RO" });
    expect(result.current?.prompts).toEqual(["a robot arm"]);
    expect(env.loadSuggestions).toHaveBeenCalledTimes(1);
  });

  it("suggests the index's prompts only from three typed characters", async () => {
    env.loadSuggestions.mockResolvedValue({
      prompts: ["red rain"],
      freeText: true,
    });
    const { result, rerender } = renderHook(
      ({ query }) =>
        useSearchSuggestions(index("emb_sim"), query, NO_HISTORY, 1),
      { initialProps: { query: "re" } },
    );
    await waitFor(() => expect(result.current?.mode).toBe("open"));
    expect(result.current?.prompts).toEqual([]);

    rerender({ query: "red" });
    expect(result.current?.prompts).toEqual(["red rain"]);
  });

  it("offers only the previous queries the index can run, first", async () => {
    env.loadSuggestions.mockResolvedValue({
      prompts: ["a red truck", "red rain"],
      freeText: false,
      actions: [{ id: "add", label: "Add queries" }],
    });
    const { result } = renderHook(() =>
      useSearchSuggestions(index("emb_sim"), "red", ["red rain", "red car"], 1),
    );
    await waitFor(() => expect(result.current?.mode).toBe("offered"));
    expect(result.current?.prompts).toEqual(["red rain", "a red truck"]);
    expect(result.current?.actions).toEqual([
      { id: "add", label: "Add queries" },
    ]);
  });

  it("loads again when asked", async () => {
    env.loadSuggestions
      .mockResolvedValueOnce(offering(["a robot arm"]))
      .mockResolvedValueOnce(offering(["a robot arm", "a robot leg"]));
    const { result, rerender } = renderHook(
      ({ loadCount }) =>
        useSearchSuggestions(index("emb_sim"), "robot", NO_HISTORY, loadCount),
      { initialProps: { loadCount: 1 } },
    );
    await waitFor(() =>
      expect(result.current?.prompts).toEqual(["a robot arm"]),
    );

    rerender({ loadCount: 2 });
    await waitFor(() =>
      expect(result.current?.prompts).toEqual(["a robot arm", "a robot leg"]),
    );
  });

  it("never offers another index's prompts", async () => {
    env.loadSuggestions.mockImplementation(({ brainKey }) =>
      brainKey === "first"
        ? Promise.resolve(offering(["a robot arm"]))
        : new Promise(() => undefined),
    );
    const { result, rerender } = renderHook(
      ({ key }) => useSearchSuggestions(index(key), "a", NO_HISTORY, 1),
      { initialProps: { key: "first" } },
    );
    await waitFor(() => expect(result.current?.mode).toBe("offered"));

    rerender({ key: "second" });
    expect(result.current).toMatchObject({ mode: "pending", prompts: [] });
  });

  it("allows nothing when the suggestions cannot load", async () => {
    env.loadSuggestions.mockRejectedValue(new Error("unreachable"));
    const { result } = renderHook(() =>
      useSearchSuggestions(index("emb_sim"), "a", NO_HISTORY, 1),
    );
    await waitFor(() => expect(result.current?.mode).toBe("offered"));
    expect(result.current?.prompts).toEqual([]);
  });
});

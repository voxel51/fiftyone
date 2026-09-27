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

// Offers the prompts containing the typed text; only they can run
const offering =
  (prompts: string[]) =>
  (query: string): { prompts: string[]; freeText: boolean } => ({
    prompts: prompts.filter((prompt) => prompt.includes(query)),
    freeText: false,
  });

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

  it("runs nothing until the suggester loads", () => {
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

  it("refines every keystroke with one loaded suggester", async () => {
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

    rerender({ query: "a ro" });
    expect(result.current?.prompts).toEqual(["a robot arm"]);
    expect(env.loadSuggestions).toHaveBeenCalledTimes(1);
  });

  it("hands the suggester the field's previous queries", async () => {
    const suggester = vi.fn(() => ({ prompts: [], freeText: true }));
    env.loadSuggestions.mockResolvedValue(suggester);
    const history = ["a red cup"];
    const { result } = renderHook(() =>
      useSearchSuggestions(index("emb_sim"), "a", history, 1),
    );
    await waitFor(() => expect(result.current?.mode).toBe("open"));
    expect(suggester).toHaveBeenLastCalledWith("a", history);
  });

  it("loads again when asked", async () => {
    env.loadSuggestions
      .mockResolvedValueOnce(offering(["a robot arm"]))
      .mockResolvedValueOnce(offering(["a robot arm", "a green bowl"]));
    const { result, rerender } = renderHook(
      ({ loadCount }) =>
        useSearchSuggestions(index("emb_sim"), "a", NO_HISTORY, loadCount),
      { initialProps: { loadCount: 1 } },
    );
    await waitFor(() =>
      expect(result.current?.prompts).toEqual(["a robot arm"]),
    );

    rerender({ loadCount: 2 });
    await waitFor(() =>
      expect(result.current?.prompts).toEqual(["a robot arm", "a green bowl"]),
    );
  });

  it("never uses another index's suggester", async () => {
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

  it("allows nothing when the suggester cannot load", async () => {
    env.loadSuggestions.mockRejectedValue(new Error("unreachable"));
    const { result } = renderHook(() =>
      useSearchSuggestions(index("emb_sim"), "a", NO_HISTORY, 1),
    );
    await waitFor(() => expect(result.current?.mode).toBe("offered"));
    expect(result.current?.prompts).toEqual([]);
  });

  it("allows nothing when the suggester throws", async () => {
    env.loadSuggestions.mockResolvedValue(() => {
      throw new Error("bad");
    });
    const { result } = renderHook(() =>
      useSearchSuggestions(index("emb_sim"), "a", NO_HISTORY, 1),
    );
    await waitFor(() => expect(result.current?.mode).toBe("offered"));
    expect(result.current?.prompts).toEqual([]);
  });
});

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  promptKeys: [] as {
    key: string;
    patchesField: string | null;
    provider?: string | null;
  }[],
  operatorAvailable: true,
  operatorRun: vi.fn(),
  OperatorSuggestions: () => null,
  providerRun: vi.fn(),
  providerSources: null as { label: string; values: string[] } | null,
  providerCancel: vi.fn(),
  ProviderSuggestions: () => null,
  sourcesWanted: vi.fn(),
  indexSlices: new Map<string, string[]>(),
  onRun: null as null | ((index: { key: string }, query: string) => void),
}));

vi.mock("@fiftyone/state", () => ({
  useCurrentDatasetName: () => "robots",
  usePromptableSimilarityKeys: () => env.promptKeys,
}));
vi.mock("@fiftyone/analytics", () => ({ useTrackEvent: () => vi.fn() }));
vi.mock("@fiftyone/operators", () => ({ executeOperator: vi.fn() }));
vi.mock("./useOperatorSearch", () => ({
  useOperatorSearch: ({ onRun }: { onRun: typeof env.onRun }) => {
    env.onRun = onRun;
    return {
      available: env.operatorAvailable,
      enabled: env.operatorAvailable,
      onUnavailable: vi.fn(),
      run: env.operatorRun,
      claimView: () => false,
      sources: null,
      indexSlices: env.indexSlices,
      Suggestions: env.OperatorSuggestions,
    };
  },
}));
vi.mock("./useProviderSearch", () => ({
  useProviderSearch: ({ sourcesWanted }: { sourcesWanted: boolean }) => {
    env.sourcesWanted(sourcesWanted);
    return {
      available: true,
      enabled: true,
      run: env.providerRun,
      cancel: env.providerCancel,
      sources: env.providerSources,
      Suggestions: env.ProviderSuggestions,
    };
  },
}));

import { useTextSearch } from "./useTextSearch";

const SERVER_INDEX = { key: "clip_sim", patchesField: null };
const PROVIDER_INDEX = {
  key: "emb_sim",
  patchesField: null,
  provider: "multimodal",
};

const renderController = () =>
  renderHook(() => useTextSearch({ currentView: [], sortStageOffered: true }));

describe("useTextSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    env.operatorAvailable = true;
    env.providerSources = null;
  });

  it("runs a query for an index the server sorts through the operator", () => {
    env.promptKeys = [SERVER_INDEX];
    const { result } = renderController();

    act(() => result.current.submit("an animal", null));

    expect(env.operatorRun).toHaveBeenCalledWith(
      SERVER_INDEX,
      "an animal",
      25,
      null,
    );
    expect(env.providerRun).not.toHaveBeenCalled();
    expect(env.providerCancel.mock.invocationCallOrder[0]).toBeLessThan(
      env.operatorRun.mock.invocationCallOrder[0],
    );
  });

  it("runs a query for an index a provider searches through the provider", () => {
    env.promptKeys = [PROVIDER_INDEX];
    const { result } = renderController();

    act(() => result.current.submit("an animal", ["/cam_left"]));

    expect(env.providerRun).toHaveBeenCalledWith(
      PROVIDER_INDEX,
      "an animal",
      25,
      ["/cam_left"],
    );
    expect(env.operatorRun).not.toHaveBeenCalled();
    expect(env.providerCancel).not.toHaveBeenCalled();
  });

  it("reads what the field offers from the selected index's search", () => {
    env.promptKeys = [SERVER_INDEX];
    env.operatorAvailable = false;
    const { result, rerender } = renderController();
    expect(result.current.available).toBe(false);
    expect(result.current.Suggestions).toBe(env.OperatorSuggestions);

    env.promptKeys = [PROVIDER_INDEX];
    rerender();
    expect(result.current.available).toBe(true);
    expect(result.current.enabled).toBe(true);
    expect(result.current.Suggestions).toBe(env.ProviderSuggestions);
  });

  it("looks up sources only once the settings open", () => {
    env.promptKeys = [PROVIDER_INDEX];
    const { result } = renderController();
    expect(env.sourcesWanted).toHaveBeenLastCalledWith(false);

    act(() => result.current.onOpenSettings());
    expect(env.sourcesWanted).toHaveBeenLastCalledWith(true);
  });

  it("hands on the indexes' slices", () => {
    env.promptKeys = [SERVER_INDEX];
    env.indexSlices = new Map([["clip_sim", ["left", "right"]]]);
    const { result } = renderController();

    expect(result.current.indexSlices).toBe(env.indexSlices);
  });

  it("offers sources only when there are several to choose between", () => {
    env.promptKeys = [PROVIDER_INDEX];
    env.providerSources = { label: "Streams", values: ["/cam_left"] };
    const { result, rerender } = renderController();
    expect(result.current.sources).toBeNull();

    env.providerSources = {
      label: "Streams",
      values: ["/cam_left", "/cam_right"],
    };
    rerender();
    expect(result.current.sources).toBe(env.providerSources);
  });

  it("offers a query in the history as soon as it runs", () => {
    env.promptKeys = [SERVER_INDEX];
    const { result } = renderController();
    expect(result.current.history).toEqual([]);

    act(() => env.onRun?.(SERVER_INDEX, "an animal"));

    expect(result.current.history).toEqual(["an animal"]);
  });
});

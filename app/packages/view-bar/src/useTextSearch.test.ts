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
  operatorSources: null as { label: string; values: string[] } | null,
  OperatorSuggestions: () => null,
  providerRun: vi.fn(),
  providerCancel: vi.fn(),
  ProviderSuggestions: () => null,
  sourcesWanted: vi.fn(),
  onRun: null as null | ((index: { key: string }, query: string) => void),
}));

vi.mock("@fiftyone/state", () => ({
  useCurrentDatasetName: () => "robots",
  usePromptableSimilarityKeys: () => env.promptKeys,
}));
vi.mock("@fiftyone/analytics", () => ({ useTrackEvent: () => vi.fn() }));
vi.mock("@fiftyone/operators", () => ({ executeOperator: vi.fn() }));
vi.mock("./useOperatorSearch", () => ({
  useOperatorSearch: ({
    onRun,
    sourcesWanted,
  }: {
    onRun: typeof env.onRun;
    sourcesWanted: boolean;
  }) => {
    env.onRun = onRun;
    env.sourcesWanted(sourcesWanted);
    return {
      available: env.operatorAvailable,
      enabled: env.operatorAvailable,
      onUnavailable: vi.fn(),
      run: env.operatorRun,
      claimView: () => false,
      sources: env.operatorSources,
      indexSlices: new Map(),
      Suggestions: env.OperatorSuggestions,
    };
  },
}));
vi.mock("./useProviderSearch", () => ({
  useProviderSearch: () => ({
    available: true,
    enabled: true,
    run: env.providerRun,
    cancel: env.providerCancel,
    sources: null,
    Suggestions: env.ProviderSuggestions,
  }),
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
    env.operatorSources = null;
  });

  it("runs a query for an index the server sorts through the operator", () => {
    env.promptKeys = [SERVER_INDEX];
    const { result } = renderController();

    act(() => result.current.submit("an animal", ["left"]));

    expect(env.operatorRun).toHaveBeenCalledWith(
      SERVER_INDEX,
      "an animal",
      25,
      ["left"],
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
    env.promptKeys = [SERVER_INDEX];
    const { result } = renderController();
    expect(env.sourcesWanted).toHaveBeenLastCalledWith(false);

    act(() => result.current.onOpenSettings());
    expect(env.sourcesWanted).toHaveBeenLastCalledWith(true);
  });

  it("offers sources only when there are several to choose between", () => {
    env.promptKeys = [SERVER_INDEX];
    env.operatorSources = { label: "Slices", values: ["left"] };
    const { result, rerender } = renderController();
    expect(result.current.sources).toBeNull();

    env.operatorSources = { label: "Slices", values: ["left", "right"] };
    rerender();
    expect(result.current.sources).toBe(env.operatorSources);
  });

  it("offers a query in the history as soon as it runs", () => {
    env.promptKeys = [SERVER_INDEX];
    const { result } = renderController();
    expect(result.current.history).toEqual([]);

    act(() => env.onRun?.(SERVER_INDEX, "an animal"));

    expect(result.current.history).toEqual(["an animal"]);
  });
});

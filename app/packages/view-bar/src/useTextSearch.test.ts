import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  promptKeys: [] as {
    key: string;
    patchesField: string | null;
    extension?: string | null;
  }[],
  operatorAvailable: true,
  operatorRun: vi.fn(),
  extensionRun: vi.fn(),
  onRun: null as null | ((index: { key: string }, query: string) => void),
}));

vi.mock("@fiftyone/state", () => ({
  useCurrentDatasetName: () => "robots",
  usePromptableSimilarityKeys: () => env.promptKeys,
}));
vi.mock("@fiftyone/analytics", () => ({ useTrackEvent: () => vi.fn() }));
vi.mock("@fiftyone/operators", () => ({ executeOperator: vi.fn() }));
vi.mock("./useOperatorSearch", () => ({
  useOperatorSearch: (_view: unknown, onRun: typeof env.onRun) => {
    env.onRun = onRun;
    return {
      available: env.operatorAvailable,
      onUnavailable: vi.fn(),
      run: env.operatorRun,
      claimView: () => false,
    };
  },
}));
vi.mock("./useLanguageSearchExtension", () => ({
  useLanguageSearchExtension: () => ({
    run: env.extensionRun,
    cancel: vi.fn(),
  }),
}));

import { useTextSearch } from "./useTextSearch";

const SERVER_INDEX = { key: "clip_sim", patchesField: null };
const EXTENSION_INDEX = {
  key: "emb_sim",
  patchesField: null,
  extension: "multimodal",
};

const renderController = () =>
  renderHook(() => useTextSearch({ currentView: [], sortStageOffered: true }));

describe("useTextSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    env.operatorAvailable = true;
  });

  it("runs a query for an index the server sorts through the operator", () => {
    env.promptKeys = [SERVER_INDEX];
    const { result } = renderController();

    act(() => result.current.submit("an animal", null));

    expect(env.operatorRun).toHaveBeenCalledWith(SERVER_INDEX, "an animal", 25);
    expect(env.extensionRun).not.toHaveBeenCalled();
  });

  it("runs a query for an index an extension searches through the extension", () => {
    env.promptKeys = [EXTENSION_INDEX];
    const { result } = renderController();

    act(() => result.current.submit("an animal", ["/cam_left"]));

    expect(env.extensionRun).toHaveBeenCalledWith(
      EXTENSION_INDEX,
      "an animal",
      25,
      ["/cam_left"],
    );
    expect(env.operatorRun).not.toHaveBeenCalled();
  });

  it("searches an extension's index without the similarity operator", () => {
    env.promptKeys = [EXTENSION_INDEX];
    env.operatorAvailable = false;
    const { result } = renderController();

    expect(result.current.available).toBe(true);
    expect(result.current.enabled).toBe(true);
  });

  it("offers a query in the history as soon as it runs", () => {
    env.promptKeys = [SERVER_INDEX];
    const { result } = renderController();
    expect(result.current.history).toEqual([]);

    act(() => env.onRun?.(SERVER_INDEX, "an animal"));

    expect(result.current.history).toEqual(["an animal"]);
  });
});

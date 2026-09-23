import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Stage = { _cls: string; kwargs: [string, unknown][] };

const env = vi.hoisted(() => ({
  view: [] as { _cls: string; kwargs: [string, unknown][] }[],
  setView: vi.fn(),
  setPending: vi.fn(),
  notify: vi.fn(),
  search: vi.fn(),
  keys: [
    {
      key: "emb_sim",
      patchesField: null,
      model: "siglip",
      backend: "multimodal",
      timestamp: null,
    },
  ],
  backends: new Map(),
}));

vi.mock("@fiftyone/state", () => ({
  useView: () => env.view,
  useCurrentDatasetName: () => "robots",
  useSetView: () => env.setView,
  useSetViewChangePending: () => env.setPending,
  useNotification: () => env.notify,
  usePromptableSimilarityKeys: () => env.keys,
  useTextSearchBackends: () => env.backends,
}));
vi.mock("@fiftyone/analytics", () => ({ useTrackEvent: () => vi.fn() }));
vi.mock("@fiftyone/operators", () => ({
  executeOperator: vi.fn(),
  useOperatorAvailability: () => false,
  useOperatorRegistryState: () => "loaded",
}));
vi.mock("@fiftyone/utilities", () => ({ buildSimilarityRunName: () => "" }));

import { useLanguageSearch } from "./useLanguageSearch";

const stage = (name: string): Stage => ({
  _cls: `fiftyone.core.stages.${name}`,
  kwargs: [],
});

const EXISTING = stage("Exists");
const MATCHES = stage("Select");

/** A backend search the test settles by hand. */
const pendingResult = () => {
  let resolve: (value: unknown) => void = () => undefined;
  env.search.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  return resolve;
};

const mount = () =>
  renderHook(() =>
    useLanguageSearch({ offersStage: () => true, onViewSent: vi.fn() }),
  );

/** Lands a view the way the router does: a re-render, then the bar's hydrate. */
const land = (
  hook: ReturnType<typeof mount>,
  view: Stage[],
): boolean | undefined => {
  env.view = view;
  hook.rerender();
  let fromSearch: boolean | undefined;
  act(() => {
    fromSearch = hook.result.current.observeView(view);
  });
  return fromSearch;
};

describe("useLanguageSearch with a text search backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.view = [EXISTING];
    env.backends = new Map([
      ["multimodal", { method: "multimodal", search: env.search }],
    ]);
  });

  it("appends the backend's stage, and decorates once that view lands", async () => {
    const decorate = vi.fn();
    const resolve = pendingResult();
    const hook = mount();

    act(() => hook.result.current.props.onSubmit("an animal"));
    await act(async () => resolve({ stage: MATCHES, decorate }));

    expect(env.setView).toHaveBeenCalledWith([EXISTING, MATCHES]);
    expect(decorate).not.toHaveBeenCalled();
    expect(land(hook, [EXISTING, MATCHES])).toBe(true);
    expect(decorate).toHaveBeenCalledTimes(1);
  });

  it("drops a result when the view changed while the search ran", async () => {
    const resolve = pendingResult();
    const hook = mount();

    act(() => hook.result.current.props.onSubmit("an animal"));
    env.view = [EXISTING, stage("Limit")];
    hook.rerender();
    await act(async () => resolve({ stage: MATCHES }));

    expect(env.setView).not.toHaveBeenCalled();
    expect(env.setPending).toHaveBeenLastCalledWith(false);
  });

  it("drops the search in flight when cancelled, releasing its pending state", async () => {
    const resolve = pendingResult();
    const hook = mount();

    act(() => hook.result.current.props.onSubmit("an animal"));
    act(() => hook.result.current.cancel());
    await act(async () => resolve({ stage: MATCHES }));

    expect(env.setView).not.toHaveBeenCalled();
    expect(env.setPending).toHaveBeenLastCalledWith(false);
  });

  it("replaces its own result when searched again over it", async () => {
    const first = pendingResult();
    const hook = mount();
    act(() => hook.result.current.props.onSubmit("an animal"));
    await act(async () => first({ stage: MATCHES }));
    land(hook, [EXISTING, MATCHES]);

    const again = stage("Select");
    again.kwargs = [["sample_ids", ["ep2"]]];
    const second = pendingResult();
    act(() => hook.result.current.props.onSubmit("a car"));
    await act(async () => second({ stage: again }));

    expect(env.setView).toHaveBeenLastCalledWith([EXISTING, again]);
  });

  it("withdraws its annotations once the view moves on", async () => {
    const withdraw = vi.fn();
    const resolve = pendingResult();
    const hook = mount();
    act(() => hook.result.current.props.onSubmit("an animal"));
    await act(async () => resolve({ stage: MATCHES, withdraw }));
    land(hook, [EXISTING, MATCHES]);

    expect(land(hook, [])).toBe(false);
    expect(withdraw).toHaveBeenCalledTimes(1);
  });

  it("withdraws its annotations when the bar unmounts", async () => {
    const withdraw = vi.fn();
    const resolve = pendingResult();
    const hook = mount();
    act(() => hook.result.current.props.onSubmit("an animal"));
    await act(async () => resolve({ stage: MATCHES, withdraw }));
    land(hook, [EXISTING, MATCHES]);

    hook.unmount();

    expect(withdraw).toHaveBeenCalledTimes(1);
  });
});

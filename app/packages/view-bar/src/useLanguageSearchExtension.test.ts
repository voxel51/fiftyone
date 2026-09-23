import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  search: vi.fn(),
  publish: vi.fn(),
  setPending: vi.fn(),
  notify: vi.fn(),
  extensions: new Map(),
}));

vi.mock("@fiftyone/state", () => ({
  useCurrentDatasetName: () => "robots",
  useTextSearchExtensions: () => env.extensions,
  usePublishExtendedSelection: () => env.publish,
  useSetViewChangePending: () => env.setPending,
  useNotification: () => env.notify,
}));
vi.mock("@fiftyone/analytics", () => ({ useTrackEvent: () => vi.fn() }));

import { readSearchQueries } from "./searchQueryHistory";
import { useLanguageSearchExtension } from "./useLanguageSearchExtension";

const INDEX = {
  key: "emb_sim",
  patchesField: null,
  extension: "multimodal",
  timestamp: null,
};
const STAGE = { "fiftyone.core.stages.Select": { sample_ids: ["ep1"] } };

/** A search the test settles by hand. */
const pendingResult = () => {
  let resolve: (value: unknown) => void = () => undefined;
  env.search.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  return resolve;
};

describe("useLanguageSearchExtension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    env.extensions = new Map([
      ["multimodal", { method: "multimodal", search: env.search }],
    ]);
  });

  it("publishes the extension's result to the extended selection", async () => {
    const decorate = vi.fn();
    const resolve = pendingResult();
    const { result } = renderHook(() => useLanguageSearchExtension());

    act(() => {
      result.current.run(INDEX, "an animal", 25);
    });
    expect(env.setPending).toHaveBeenLastCalledWith(true);
    await act(async () => resolve({ stage: STAGE, decorate }));

    expect(env.search).toHaveBeenCalledWith(
      expect.objectContaining({
        brainKey: "emb_sim",
        query: "an animal",
        k: 25,
      }),
    );
    expect(env.publish).toHaveBeenCalledWith(STAGE, decorate);
    expect(env.setPending).toHaveBeenLastCalledWith(false);
  });

  it("records the query in the dataset's history and shows it at once", () => {
    pendingResult();
    const { result } = renderHook(() => useLanguageSearchExtension());

    act(() => {
      result.current.run(INDEX, "an animal", 25);
    });

    expect(readSearchQueries("robots")).toEqual(["an animal"]);
    expect(result.current.recentQueries).toEqual(["an animal"]);
  });

  it("leaves an index no extension searches to the caller", () => {
    const { result } = renderHook(() => useLanguageSearchExtension());

    let ran = true;
    act(() => {
      ran = result.current.run({ ...INDEX, extension: null }, "a car", 25);
    });

    expect(ran).toBe(false);
    expect(env.search).not.toHaveBeenCalled();
  });

  it("publishes only the newest search when an older one settles later", async () => {
    const first = pendingResult();
    const second = pendingResult();
    const { result } = renderHook(() => useLanguageSearchExtension());

    act(() => {
      result.current.run(INDEX, "an animal", 25);
      result.current.run(INDEX, "a car", 25);
    });
    const newer = { "fiftyone.core.stages.Select": { sample_ids: ["ep2"] } };
    await act(async () => second({ stage: newer }));
    await act(async () => first({ stage: STAGE }));

    expect(env.publish).toHaveBeenCalledTimes(1);
    expect(env.publish).toHaveBeenCalledWith(newer, undefined);
  });

  it("fails an extension that throws before returning its promise like any other failure", async () => {
    env.search.mockImplementationOnce(() => {
      throw new Error("the extension is misconfigured");
    });
    const { result } = renderHook(() => useLanguageSearchExtension());

    await act(async () => {
      result.current.run(INDEX, "an animal", 25);
    });

    expect(env.notify).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "the extension is misconfigured" }),
    );
    expect(env.setPending).toHaveBeenLastCalledWith(false);
  });

  it("drops a search still running when the field unmounts", async () => {
    const resolve = pendingResult();
    const { result, unmount } = renderHook(() => useLanguageSearchExtension());

    act(() => {
      result.current.run(INDEX, "an animal", 25);
    });
    unmount();
    await act(async () => resolve({ stage: STAGE }));

    expect(env.publish).not.toHaveBeenCalled();
    expect(env.setPending).toHaveBeenLastCalledWith(false);
  });
});

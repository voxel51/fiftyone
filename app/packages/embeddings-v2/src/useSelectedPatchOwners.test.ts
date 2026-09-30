// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMasks, type Masks } from "./protocol";
import { useSelectedPatchOwners } from "./useSelectedPatchOwners";

vi.mock("@fiftyone/utilities", () => ({
  getFetchFunction: () => {
    throw new Error("network use in a unit test");
  },
}));
vi.mock("./protocol", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./protocol")>()),
  fetchMasks: vi.fn(),
}));

const PATCHES_VIEW = [{ _cls: "fiftyone.core.stages.ToPatches" }];

const answer = (match: number[]): Masks => ({
  visible: null,
  match: new Uint8Array(match),
});

const deferred = () => {
  let resolve: (masks: Masks) => void = () => undefined;
  const promise = new Promise<Masks>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

interface Props {
  patchIds: readonly string[] | null;
  loadedCount: number;
}

const render = (initialProps: Props) =>
  renderHook(
    ({ patchIds, loadedCount }: Props) =>
      useSelectedPatchOwners("ds", "viz", PATCHES_VIEW, patchIds, loadedCount),
    { initialProps },
  );

describe("useSelectedPatchOwners", () => {
  beforeEach(() => {
    vi.mocked(fetchMasks).mockReset();
    vi.mocked(fetchMasks).mockResolvedValue(answer([0, 1, 1, 0]));
  });

  it("asks nothing while no patch is selected", () => {
    const { result } = render({ patchIds: null, loadedCount: 4 });

    expect(fetchMasks).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("asks the server which samples own the patches, in the grid's view", async () => {
    const patchIds = ["p1", "p2"];
    const { result } = render({ patchIds, loadedCount: 4 });

    await waitFor(() => expect(result.current).toEqual([1, 2]));
    expect(fetchMasks).toHaveBeenCalledWith("ds", "viz", PATCHES_VIEW, null, {
      "fiftyone.core.stages.Select": {
        sample_ids: ["p1", "p2"],
        ordered: false,
      },
    });
  });

  it("clips the owners to the points loaded so far", async () => {
    const { result } = render({ patchIds: ["p1"], loadedCount: 2 });

    await waitFor(() => expect(result.current).toEqual([1]));
  });

  it("treats owners outside the loaded points as no selection", async () => {
    // An empty selection would dim every point
    vi.mocked(fetchMasks).mockResolvedValue(answer([0, 0, 0, 1]));
    const { result } = render({ patchIds: ["p1"], loadedCount: 3 });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMasks).toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("never lights a new selection with an earlier selection's answer", async () => {
    const earlier = deferred();
    vi.mocked(fetchMasks)
      .mockReturnValueOnce(earlier.promise)
      .mockResolvedValueOnce(answer([1, 0, 0, 0]));
    const { result, rerender } = render({ patchIds: ["p1"], loadedCount: 4 });

    rerender({ patchIds: ["p2"], loadedCount: 4 });
    await waitFor(() => expect(result.current).toEqual([0]));

    await act(async () => {
      earlier.resolve(answer([0, 1, 1, 0]));
      await earlier.promise;
    });
    expect(result.current).toEqual([0]);
  });
});

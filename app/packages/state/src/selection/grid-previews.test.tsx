import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EpisodeSelection, GridSampleNode } from "./types";

const mocks = vi.hoisted(() => ({
  empty: {},
  view: [] as readonly unknown[],
  availability: vi.fn(),
  details: vi.fn(),
}));
vi.mock("../accessors/dataset", () => ({
  useCurrentDatasetId: () => "preview-hooks",
  useDatasetMediaType: () => "image",
  useSampleSchema: () => mocks.empty,
  useGridGroupSlice: () => null,
  useGridViewScope: () => ({
    view: mocks.view,
    filters: mocks.empty,
    extendedStages: mocks.empty,
    refresh: 0,
  }),
}));
vi.mock("./client", () => ({
  combineSelectionCaptures: vi.fn(),
  countSelectionCaptures: vi.fn(),
  resolveSelectionDetails: mocks.details,
  getSelectionAvailability: mocks.availability,
  resolveSelection: vi.fn(async () => ({
    groups: [],
    counts: {
      episodes: 10,
      fullEpisodes: 10,
      segments: 0,
      segmentEpisodes: 0,
      unavailable: 0,
    },
  })),
  createSelectionSnapshot: vi.fn(),
}));
import { useGridSelection, useLoadGridSelection } from "./grid-hooks";

const node: GridSampleNode = {
  id: "image",
  sample: { _id: "image", filepath: "/image.jpg", _media_type: "image" },
  urls: [{ field: "filepath", url: "https://media.example/image.jpg" }],
  aspectRatio: 2,
};

beforeEach(() => {
  sessionStorage.clear();
  mocks.view = [];
  mocks.availability.mockReset().mockResolvedValue({});
  mocks.details.mockReset().mockResolvedValue({ groups: [] });
});
afterEach(cleanup);

function mount() {
  const store = createStore();
  const wrapper = ({ children }: PropsWithChildren) => (
    <Provider store={store}>{children}</Provider>
  );
  const previews = new Map([[node.id, node]]);
  const getPreview = (id: string) => previews.get(id);
  const hook = renderHook(
    () => {
      useLoadGridSelection();
      return useGridSelection(getPreview);
    },
    { wrapper },
  );
  return { ...hook, previews };
}

it("captures loaded media immediately and keeps it through background validation", async () => {
  let refresh!: (metadata: Record<string, Partial<EpisodeSelection>>) => void;
  mocks.availability.mockImplementationOnce(
    () => new Promise((resolve) => (refresh = resolve)),
  );
  const { result, previews } = mount();
  act(() => {
    void result.current.toggle(node.id);
  });
  const captured = result.current.selected.get(node.id);
  expect(captured?.node).toBe(node);
  expect(captured?.filepath).toBe("/image.jpg");
  expect(captured?.aspectRatio).toBe(2);
  expect(result.current.pendingCaptures).toBe(false);
  expect(captured?.members).toEqual([{ episodeId: node.id, kind: "episode" }]);

  // The tray owns the captured node even after its grid page is gone.
  previews.clear();
  await waitFor(() => expect(mocks.availability).toHaveBeenCalledTimes(1));
  expect(result.current.selected.get(node.id)?.node).toBe(node);
  const renewed = {
    ...node,
    urls: [{ field: "filepath", url: "https://media.example/image.jpg?new" }],
  };
  await act(async () =>
    refresh({ image: { node: renewed, unavailable: false } }),
  );
  expect(result.current.selected.get(node.id)?.node).toBe(renewed);
  expect(result.current.selected.get(node.id)?.members).toEqual(
    captured?.members,
  );
});

it("uses server metadata for an unloaded sample without delaying loaded range previews", async () => {
  let refresh!: (metadata: Record<string, Partial<EpisodeSelection>>) => void;
  mocks.availability.mockImplementationOnce(
    () => new Promise((resolve) => (refresh = resolve)),
  );
  const { result } = mount();
  act(() => {
    void result.current.select([node.id, "unloaded"]);
  });
  expect(result.current.selected.get(node.id)?.node).toBe(node);
  expect(result.current.selected.get("unloaded")?.node).toBeUndefined();
  await waitFor(() => expect(mocks.availability).toHaveBeenCalledTimes(1));
  const loaded = {
    ...node,
    id: "unloaded",
    sample: { ...node.sample, _id: "unloaded" },
  };
  await act(async () => refresh({ unloaded: { node: loaded } }));
  expect(result.current.selected.get("unloaded")?.node).toBe(loaded);
  expect(result.current.selected.get(node.id)?.node).toBe(node);
});

it("keeps the grid preview when background validation fails", async () => {
  mocks.availability.mockRejectedValueOnce(new Error("offline"));
  const { result } = mount();
  await act(async () => result.current.toggle(node.id));
  expect(result.current.selected.get(node.id)?.node).toBe(node);
  expect(result.current.capturedError).toBeNull();
});

it.each(["ToFrames", "ToClips", "GroupBy"])(
  "still resolves %s membership on the server with a loaded preview",
  async (stage) => {
    mocks.view = [{ _cls: `fiftyone.core.stages.${stage}`, kwargs: [] }];
    let resolve!: (value: { groups: EpisodeSelection[] }) => void;
    mocks.details.mockImplementationOnce(
      () => new Promise((finish) => (resolve = finish)),
    );
    const { result } = mount();
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.select([node.id]);
    });
    expect(result.current.selected.size).toBe(0);
    expect(result.current.pendingCaptures).toBe(true);
    expect(mocks.details).toHaveBeenCalledWith(
      "preview-hooks",
      expect.objectContaining({ episodeIds: [node.id], capture: true }),
    );
    const resolved: EpisodeSelection = {
      episodeId: "source",
      members: [{ episodeId: "source", kind: "episode" }],
    };
    await act(async () => {
      resolve({ groups: [resolved] });
      await pending;
    });
    expect(result.current.selected.get("source")).toEqual(resolved);
    expect(result.current.pendingCaptures).toBe(false);
  },
);

it("waits for patch geometry instead of briefly showing the uncropped grid source", async () => {
  mocks.view = [{ _cls: "fiftyone.core.stages.ToPatches", kwargs: [] }];
  const { result } = mount();
  await act(async () => result.current.toggle(node.id));
  expect(result.current.selected.get(node.id)?.node).toBeUndefined();
  expect(mocks.availability).toHaveBeenCalled();
});

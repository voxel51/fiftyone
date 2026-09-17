import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The hook under test is a Recoil callback that only ever touches the store
 * through `set` and `snapshot`, so those two are faked with a plain map and
 * Recoil itself is never loaded. The atoms it names are stubbed as their
 * keys, which is all the fake store needs to tell them apart.
 */
const store = vi.hoisted(() => new Map<string, unknown>());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("recoil", () => ({
  useRecoilCallback: (
    factory: (iface: {
      set: (key: string, next: unknown) => void;
      snapshot: { getLoadable: (key: string) => { getValue: () => unknown } };
    }) => unknown,
  ) =>
    factory({
      set: (key, next) => {
        store.set(
          key,
          typeof next === "function" ? next(store.get(key)) : next,
        );
      },
      snapshot: {
        getLoadable: (key) => ({ getValue: () => store.get(key) }),
      },
    }),
}));

vi.mock("@fiftyone/utilities", () => ({ getFetchFunction: () => fetchMock }));
vi.mock("@fiftyone/looker", () => ({}));
vi.mock("@fiftyone/playback", () => ({ getTimelineConfigAtom: () => "" }));
vi.mock("../jotai", () => ({
  hoveredInstances: "hoveredInstances",
  jotaiStore: { get: () => false },
}));
vi.mock("../recoil", () => ({
  datasetName: "datasetName",
  selectedLabelMap: "selectedLabelMap",
  view: "view",
}));
vi.mock("../recoil/atoms", () => ({
  hoveredSample: "hoveredSample",
  selectedLabels: "selectedLabels",
}));

const { useToggleInstanceLabelsAcrossFrames } =
  await import("./useOnShiftClickLabel");

const label = (labelId: string, instanceId: string, frameNumber: number) => ({
  labelId,
  field: "frames.detections",
  sampleId: "s1",
  frameNumber,
  instanceId,
});

describe("useToggleInstanceLabelsAcrossFrames", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    store.set("datasetName", "ds");
    store.set("view", []);
    store.set("selectedLabels", []);
  });

  it("selects every label of the instance the server reports, skipping those already selected", async () => {
    store.set("selectedLabels", [label("l1", "track-a", 3)]);
    fetchMock.mockResolvedValue({
      count: 3,
      instance_id: "track-a",
      label_id_map: { l1: 3, l2: 4, l3: 9 },
      range: null,
    });

    await useToggleInstanceLabelsAcrossFrames()({
      sampleId: "s1",
      instanceId: "track-a",
      field: "frames.detections",
      select: true,
    });

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "POST",
      "/get-similar-labels-frames",
      {
        instanceId: "track-a",
        sampleId: "s1",
        numFrames: undefined,
        dataset: "ds",
        view: [],
      },
    );
    expect(store.get("selectedLabels")).toEqual([
      label("l1", "track-a", 3),
      label("l2", "track-a", 4),
      label("l3", "track-a", 9),
    ]);
  });

  it("deselects every selected label of the instance and nothing else", async () => {
    store.set("selectedLabels", [
      label("l1", "track-b", 3),
      label("l2", "track-other", 3),
      label("l3", "track-b", 8),
    ]);

    await useToggleInstanceLabelsAcrossFrames()({
      sampleId: "s1",
      instanceId: "track-b",
      field: "frames.detections",
      select: false,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.get("selectedLabels")).toEqual([
      label("l2", "track-other", 3),
    ]);
  });

  it("leaves the selection alone when the server request fails", async () => {
    const before = [label("l1", "track-c", 3)];
    store.set("selectedLabels", before);
    fetchMock.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await useToggleInstanceLabelsAcrossFrames()({
      sampleId: "s1",
      instanceId: "track-c",
      field: "frames.detections",
      select: true,
    });

    expect(store.get("selectedLabels")).toBe(before);
  });
});

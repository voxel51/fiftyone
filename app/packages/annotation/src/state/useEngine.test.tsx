import { renderHook } from "@testing-library/react";
import type { Schema } from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";
import { useAnnotationEngine, useSyncAnnotationEngine } from "./useEngine";
import { useSampleInstance } from "./useSample";

let mockModalSample: { sample?: { _id: string } } | undefined;
let mockSceneSample: { sample?: { _id: string } } | undefined;

let mockIsVideo = false;

vi.mock("@fiftyone/state", () => ({
  useModalSample: () => mockModalSample,
  // the 3D scene sample (stable/non-suspending variant); when its id differs
  // from the modal sample a second store is registered, otherwise the set
  // collapses to one
  useStableSceneSample3d: () => mockSceneSample,
  useCurrentSampleId: () => mockModalSample?.sample?._id ?? null,
  // a video modal sample is owned by the video surface, not this hook
  useIsVideo: () => mockIsVideo,
}));

const schema = {
  ground_truth: {
    embeddedDocType: "fiftyone.core.labels.Detections",
    ftype: "fiftyone.core.fields.EmbeddedDocumentField",
    fields: {
      detections: {
        ftype: "fiftyone.core.fields.ListField",
        subfield: "fiftyone.core.fields.EmbeddedDocumentField",
      },
    },
  },
} as unknown as Schema;

const det = (id: string, label = "cat") => ({
  _id: id,
  _cls: "Detection",
  label,
});

// the engine and Sample are session singletons (module-scoped atoms), exactly
// as in the app — each test unmounts and clears so the next starts clean
const renderSync = () =>
  renderHook(() => {
    useSyncAnnotationEngine();
    return { engine: useAnnotationEngine(), sample: useSampleInstance() };
  });

describe("useSyncAnnotationEngine", () => {
  it("registers a store for the modal sample; unmount detaches it", () => {
    mockModalSample = { sample: { _id: "s1" } };
    mockSceneSample = undefined;
    const { result, unmount } = renderSync();
    const { engine, sample } = result.current;

    sample.setSchema(schema);
    sample.setData({
      ground_truth: { _cls: "Detections", detections: [det("d1")] },
    });

    const ref = { sample: "s1", path: "ground_truth", instanceId: "d1" };
    expect(engine.getLabel(ref)?.label).toBe("cat");

    unmount();

    expect(engine.getLabel(ref)).toBeUndefined();
    sample.clear();
  });

  it("skips a video modal sample — the video surface owns it", () => {
    mockModalSample = { sample: { _id: "vid" } };
    mockSceneSample = undefined;
    mockIsVideo = true;

    const { result, unmount } = renderSync();

    // no store registered for the video sample: a write has nowhere to land
    expect(() =>
      result.current.engine.updateLabel(
        { sample: "vid", path: "frames.detections", instanceId: "d1" },
        { label: "x" }
      )
    ).toThrow(/no store/);

    unmount();
    mockIsVideo = false;
  });

  it("registers nothing without a modal sample", () => {
    mockModalSample = undefined;
    mockSceneSample = undefined;
    const { result, unmount } = renderSync();

    expect(() =>
      result.current.engine.updateLabel(
        { sample: "s1", path: "ground_truth", instanceId: "d1" },
        { label: "x" }
      )
    ).toThrow(/no store/);

    unmount();
  });

  it("re-keys the store on sample switch and sweeps the old selection", () => {
    mockModalSample = { sample: { _id: "s1" } };
    mockSceneSample = undefined;
    const { result, rerender, unmount } = renderSync();
    const { engine } = result.current;
    const s1Sample = result.current.sample;

    s1Sample.setSchema(schema);
    s1Sample.setData({
      ground_truth: { _cls: "Detections", detections: [det("d1")] },
    });
    engine.interaction.setActive([
      { sample: "s1", path: "ground_truth", instanceId: "d1" },
    ]);

    // a switch surfaces a distinct per-sample instance; the store re-keys over
    // it and the old sample's store (and its selection) is swept
    mockModalSample = { sample: { _id: "s2" } };
    rerender();
    const s2Sample = result.current.sample;
    s2Sample.setSchema(schema);
    s2Sample.setData({
      ground_truth: { _cls: "Detections", detections: [det("d2", "dog")] },
    });

    expect(engine.interaction.getActive()).toEqual([]);
    expect(
      engine.getLabel({ sample: "s1", path: "ground_truth", instanceId: "d1" })
    ).toBeUndefined();
    expect(
      engine.getLabel({ sample: "s2", path: "ground_truth", instanceId: "d2" })
        ?.label
    ).toBe("dog");

    unmount();
    s1Sample.clear();
    s2Sample.clear();
  });

  it("registers a second store for a co-resident 3D scene; no cross-bleed", () => {
    // a grouped modal: the selected 2D slice (s1) and the pinned 3D scene
    // (pcd, a distinct doc) render at once — each must resolve from its own
    // store, never the other's (the wrong-slice-sidebar bug)
    mockModalSample = { sample: { _id: "s1" } };
    mockSceneSample = { sample: { _id: "pcd" } };

    const { result, unmount } = renderHook(() => {
      useSyncAnnotationEngine();
      return {
        engine: useAnnotationEngine(),
        modal: useSampleInstance("s1"),
        scene: useSampleInstance("pcd"),
      };
    });
    const { engine, modal, scene } = result.current;

    modal.setSchema(schema);
    modal.setData({
      ground_truth: { _cls: "Detections", detections: [det("d1")] },
    });
    scene.setSchema(schema);
    scene.setData({
      ground_truth: { _cls: "Detections", detections: [det("c1", "car")] },
    });

    expect(
      engine.getLabel({
        sample: "s1",
        path: "ground_truth",
        instanceId: "d1",
      })?.label
    ).toBe("cat");
    expect(
      engine.getLabel({
        sample: "pcd",
        path: "ground_truth",
        instanceId: "c1",
      })?.label
    ).toBe("car");
    // the 3D label is NOT visible under the 2D slice's id, and vice versa
    expect(
      engine.getLabel({
        sample: "s1",
        path: "ground_truth",
        instanceId: "c1",
      })
    ).toBeUndefined();

    unmount();
    modal.clear();
    scene.clear();
  });
});

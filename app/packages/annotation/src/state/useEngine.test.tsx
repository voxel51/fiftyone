import { renderHook } from "@testing-library/react";
import type { Schema } from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";
import { useAnnotationEngine, useSyncAnnotationEngine } from "./useEngine";
import { useSampleInstance } from "./useSample";

let mockModalSample: { sample?: { _id: string } } | undefined;

vi.mock("@fiftyone/state", () => ({
  useModalSample: () => mockModalSample,
  // no separate 3D scene in these tests: the 3D key tracks the modal sample,
  // so the registered set collapses to one store
  useCurrentSampleId: () => mockModalSample?.sample?._id ?? null,
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

  it("registers nothing without a modal sample", () => {
    mockModalSample = undefined;
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
});

import { type AnnotationLabel } from "@fiftyone/state";
import { createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { current, currentField, editing } from "./state";

function makeLabel(
  path: string,
  data: Record<string, unknown> = {}
): AnnotationLabel {
  return {
    path,
    type: "Detection",
    data: {
      _id: "label-1",
      label: "car",
      confidence: 0.95,
      tags: ["reviewed"],
      ...data,
    },
    overlay: {
      id: "overlay-1",
      field: path,
      label: {},
      updateField: vi.fn(),
      updateLabel: vi.fn(),
      setSelected: vi.fn(),
    },
  } as unknown as AnnotationLabel;
}

describe("currentField atom", () => {
  it("should not wipe data when the field is unchanged", () => {
    const store = createStore();

    const label = makeLabel("predictions");
    const labelAtom = { init: label, read: () => label, write: () => {} };
    store.set(editing as any, labelAtom);

    // Manually seed `current` by setting the editing atom's value
    store.set(current, label);

    // Sanity check: data has attributes
    expect(store.get(current)?.data.confidence).toBe(0.95);
    expect(store.get(current)?.data.label).toBe("car");

    // Set field to the same path
    store.set(currentField, "predictions");

    // Data should be preserved
    const after = store.get(current);
    expect(after?.data.confidence).toBe(0.95);
    expect(after?.data.label).toBe("car");
    expect(after?.data.tags).toEqual(["reviewed"]);

    // Overlay methods should NOT have been called
    expect(label.overlay.updateField).not.toHaveBeenCalled();
    expect(label.overlay.updateLabel).not.toHaveBeenCalled();
  });

  it("should wipe data when changing to a different field", () => {
    const store = createStore();

    const label = makeLabel("predictions");
    const captured: AnnotationLabel[] = [];
    const labelAtom = {
      init: label,
      read: () => (captured.length ? captured[captured.length - 1] : label),
      write: (_get: any, _set: any, value: AnnotationLabel) => {
        captured.push(value);
      },
    };
    store.set(editing as any, labelAtom);

    // Set field to a different path
    store.set(currentField, "ground_truth");

    // Overlay methods should have been called
    expect(label.overlay.updateField).toHaveBeenCalledWith("ground_truth");
    expect(label.overlay.updateLabel).toHaveBeenCalledWith({
      _id: "label-1",
    });
  });

  it("should be a no-op when there is no current label", () => {
    const store = createStore();

    // editing defaults to null, so current is null
    expect(() => store.set(currentField, "predictions")).not.toThrow();
  });
});

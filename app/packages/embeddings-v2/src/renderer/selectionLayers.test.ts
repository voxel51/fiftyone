import { describe, expect, it } from "vitest";
import { SelectionLayers } from "./selectionLayers";

describe("SelectionLayers", () => {
  // The reported bug, end to end: lasso 5 points, check a grid sample,
  // uncheck it — the lasso's emphasis must come back, not vanish
  it("restores the lasso when the host selection clears", () => {
    const layers = new SelectionLayers();
    expect(layers.writeLasso([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
    expect(layers.writeHost([1])).toEqual([1]);
    expect(layers.writeHost(null)).toEqual([1, 2, 3, 4, 5]);
  });

  it("restores the host when the lasso clears", () => {
    const layers = new SelectionLayers();
    layers.writeHost([7]);
    expect(layers.writeLasso([1, 2])).toEqual([1, 2]);
    // Empty-space click / empty lasso: back to the checkbox emphasis
    expect(layers.writeLasso(null)).toEqual([7]);
  });

  // Plain precedence fails here in one direction or the other; the
  // most recent writer must render
  it("renders the most recent writer, either order", () => {
    const layers = new SelectionLayers();
    layers.writeHost([7]);
    expect(layers.writeLasso([1, 2])).toEqual([1, 2]);
    expect(layers.writeHost([8])).toEqual([8]);
  });

  it("clear drops both layers", () => {
    const layers = new SelectionLayers();
    layers.writeLasso([1, 2]);
    layers.writeHost([7]);
    expect(layers.clear()).toBeNull();
    expect(layers.current()).toBeNull();
    // Nothing resurrects after an explicit clear
    expect(layers.writeHost(null)).toBeNull();
    expect(layers.writeLasso(null)).toBeNull();
  });

  it("is empty until someone writes", () => {
    expect(new SelectionLayers().current()).toBeNull();
  });
});

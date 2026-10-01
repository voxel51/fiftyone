/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LABEL_ARCHETYPE_PRIORITY } from "../constants";
import { drawChip } from "./chipTestUtils";
import { _resetChipStacks } from "./labelChip";
import { RegressionOverlay, type RegressionLabel } from "./RegressionOverlay";

const make = (id: string, label: RegressionLabel) =>
  new RegressionOverlay({ id, field: "score", label });

beforeEach(_resetChipStacks);
afterEach(_resetChipStacks);

describe("RegressionOverlay", () => {
  it("draws the value and confidence", () => {
    const [text] = drawChip(make("a", { value: 0.42, confidence: 0.9 }));
    expect(text).toBe("0.42 0.9");
  });

  it("draws just the value when confidence is missing", () => {
    const [text, , opts] = drawChip(make("a", { value: 17 }));
    expect(text).toBe("17");
    expect(opts.fontStyle).toBe("normal");
  });

  it("treats zero as a value, not as missing", () => {
    const [text, , opts] = drawChip(make("a", { value: 0 }));
    expect(text).toBe("0");
    expect(opts.fontStyle).toBe("normal");
  });

  it("draws an italic placeholder when the value is null", () => {
    const [text, , opts] = drawChip(make("a", { value: null }));
    expect(text).toBe("no value");
    expect(opts.fontStyle).toBe("italic");
  });

  it("anchors at the media's top-left", () => {
    const [, position] = drawChip(make("a", { value: 1 }));
    expect(position).toEqual({ x: 0, y: 0 });
  });

  it("reports Regression in tooltip info", () => {
    const info = make("a", { value: 0.42 }).getTooltipInfo();
    expect(info?.type).toBe("Regression");
    expect(info?.field).toBe("score");
    expect(info?.label?.value).toBe(0.42);
  });

  it("reports the REGRESSION selection priority", () => {
    expect(make("a", { value: 1 }).getSelectionPriority()).toBe(
      LABEL_ARCHETYPE_PRIORITY.REGRESSION,
    );
  });

  it("toggleSelected flips the state and marks dirty", () => {
    const o = make("a", { value: 1 });
    expect(o.toggleSelected()).toBe(true);
    expect(o.isSelected()).toBe(true);
    expect(o.getIsDirty()).toBe(true);
  });

  it("returns 'RegressionOverlay' as its overlay type", () => {
    expect(make("a", { value: 1 }).getOverlayType()).toBe("RegressionOverlay");
  });
});

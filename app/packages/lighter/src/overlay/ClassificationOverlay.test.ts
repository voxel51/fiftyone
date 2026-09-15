/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LABEL_ARCHETYPE_PRIORITY } from "../constants";
import { drawChip } from "./chipTestUtils";
import {
  ClassificationOverlay,
  type ClassificationLabel,
} from "./ClassificationOverlay";
import { _resetChipStacks } from "./labelChip";

const make = (id: string, label: ClassificationLabel) =>
  new ClassificationOverlay({ id, field: "animal", label });

beforeEach(_resetChipStacks);
afterEach(_resetChipStacks);

describe("ClassificationOverlay", () => {
  it("draws the class name and confidence", () => {
    const [text] = drawChip(make("a", { label: "cat", confidence: 0.9 }));
    expect(text).toBe("cat 0.9");
  });

  it("draws just the class name when confidence is missing", () => {
    const [text, , opts] = drawChip(make("a", { label: "cat" }));
    expect(text).toBe("cat");
    expect(opts.fontStyle).toBe("normal");
  });

  it("draws an italic placeholder when the class name is missing", () => {
    const [text, , opts] = drawChip(make("a", {}));
    expect(text).toBe("select classification...");
    expect(opts.fontStyle).toBe("italic");
  });

  it("reports Classification in tooltip info", () => {
    const info = make("a", { label: "cat" }).getTooltipInfo();
    expect(info?.type).toBe("Classification");
    expect(info?.field).toBe("animal");
  });

  it("reports the CLASSIFICATION selection priority", () => {
    expect(make("a", { label: "cat" }).getSelectionPriority()).toBe(
      LABEL_ARCHETYPE_PRIORITY.CLASSIFICATION,
    );
  });

  it("returns 'ClassificationOverlay' as its overlay type", () => {
    expect(make("a", { label: "cat" }).getOverlayType()).toBe(
      "ClassificationOverlay",
    );
  });
});

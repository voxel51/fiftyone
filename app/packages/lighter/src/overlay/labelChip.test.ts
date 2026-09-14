/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { drawChip } from "./chipTestUtils";
import {
  ClassificationOverlay,
  type ClassificationLabel,
} from "./ClassificationOverlay";
import { _resetChipStacks, chipStackFor } from "./labelChip";
import { RegressionOverlay, type RegressionLabel } from "./RegressionOverlay";

const classification = (id: string, label: ClassificationLabel) =>
  new ClassificationOverlay({ id, field: "animal", label });

const regression = (id: string, label: RegressionLabel) =>
  new RegressionOverlay({ id, field: "score", label });

beforeEach(_resetChipStacks);
afterEach(_resetChipStacks);

describe("chip stack", () => {
  it("orders classifications and regressions together by chip text", () => {
    const channel = "ch1";
    const cls = classification("a", { label: "cat" });
    const reg = regression("b", { value: 3.5 });
    cls.setEventChannel(channel);
    reg.setEventChannel(channel);

    // "3.5" sorts before "cat"
    expect(drawChip(reg)[2].offset).toMatchObject({ bottom: 0 });
    expect(drawChip(cls)[2].offset).toMatchObject({ bottom: 1 });
  });

  it("keeps channels apart", () => {
    const a = regression("a", { value: 1 });
    const b = regression("b", { value: 0 });
    a.setEventChannel("one");
    b.setEventChannel("two");

    expect(drawChip(a)[2].offset).toMatchObject({ bottom: 0 });
    expect(drawChip(b)[2].offset).toMatchObject({ bottom: 0 });
  });

  it("re-dirties every sibling when a chip's label changes", () => {
    const channel = "ch1";
    const a = regression("a", { value: 1 });
    const b = regression("b", { value: 2 });
    a.setEventChannel(channel);
    b.setEventChannel(channel);
    a.markClean();
    b.markClean();

    a.label = { value: 9 };

    expect(a.getIsDirty()).toBe(true);
    expect(b.getIsDirty()).toBe(true);
  });

  it("forgets a destroyed chip and drops an emptied channel", () => {
    const channel = "ch1";
    const a = regression("a", { value: 1 });
    const b = regression("b", { value: 2 });
    a.setEventChannel(channel);
    b.setEventChannel(channel);

    a.destroy();
    expect(chipStackFor(channel).size).toBe(1);
    expect(drawChip(b)[2].offset).toMatchObject({ bottom: 0 });

    b.destroy();
    expect(chipStackFor(channel).size).toBe(0);
  });
});

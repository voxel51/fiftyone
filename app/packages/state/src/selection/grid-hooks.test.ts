import { describe, expect, it } from "vitest";
import { reconcileSelection } from "./grid-hooks";

describe("legacy selection reconciliation", () => {
  it("does nothing when both stores already agree", () => {
    expect(reconcileSelection(null, ["a"], ["a"], null)).toEqual({
      kind: "none",
    });
  });

  it("lets the tray win on first sight, and never adopts foreign ids", () => {
    expect(reconcileSelection(null, ["a"], ["b"], null)).toEqual({
      kind: "push",
      ids: ["a"],
    });
    expect(reconcileSelection(null, [], ["b"], null)).toEqual({ kind: "wait" });
    expect(reconcileSelection(null, [], ["b"], new Set(["a"]))).toEqual({
      kind: "push",
      ids: [],
    });
    expect(reconcileSelection(null, [], ["b"], new Set(["a", "b"]))).toEqual({
      kind: "adopt",
      capture: ["b"],
      remove: [],
    });
  });

  it("adopts changes made only on the legacy side and pushes tray changes", () => {
    const previous = { tray: ["a", "b"], legacy: ["a", "b"] };
    expect(reconcileSelection(previous, ["a", "b"], ["a", "c"], null)).toEqual({
      kind: "adopt",
      capture: ["c"],
      remove: ["b"],
    });
    expect(reconcileSelection(previous, ["a"], ["a", "b"], null)).toEqual({
      kind: "push",
      ids: ["a"],
    });
    expect(reconcileSelection(previous, ["a"], ["c"], null)).toEqual({
      kind: "push",
      ids: ["a"],
    });
  });
});

import { describe, expect, it } from "vitest";
import { panelsCompareFn } from "./sort";

describe("panelsCompareFn", () => {
  it("compares panel by names correctly", () => {
    expect(panelsCompareFn({ name: "a" }, { name: "b" })).toBe(-1);
    expect(panelsCompareFn({ name: "b" }, { name: "a" })).toBe(1);
    expect(panelsCompareFn({ name: "a" }, { name: "a" })).toBe(0);
    expect(panelsCompareFn({ name: "a" }, { name: "A" })).toBe(1);
  });

  it("compares panel by priorities correctly", () => {
    expect(
      panelsCompareFn(
        { name: "a", panelOptions: { priority: 1 } },
        { name: "b", panelOptions: { priority: 2 } }
      )
    ).toBe(1);
    expect(
      panelsCompareFn(
        { name: "b", panelOptions: { priority: 2 } },
        { name: "a", panelOptions: { priority: 1 } }
      )
    ).toBe(-1);
    expect(
      panelsCompareFn(
        { name: "a", panelOptions: { priority: 1 } },
        { name: "a", panelOptions: { priority: 1 } }
      )
    ).toBe(0);
  });

  it("sorts panels by priority first and then by name", () => {
    const panels = [
      { name: "a", panelOptions: { priority: 1 } },
      { name: "b", panelOptions: { priority: 1 } },
      { name: "c", panelOptions: { priority: 2 } },
      { name: "d", panelOptions: { priority: 2 } },
    ];
    const sortedPanels = panels.sort(panelsCompareFn);
    expect(sortedPanels.map((panel) => panel.name).join("")).toEqual("cdab");
  });

  it("sorts panels FiftyOne", () => {
    const panels = [
      { name: "e", panelOptions: { priority: 1 } },
      { name: "i", panelOptions: { priority: 6 } },
      { name: "O", panelOptions: { priority: 3 } },
      { name: "t", panelOptions: { priority: 4 } },
      { name: "y", panelOptions: { priority: 4 } },
      { name: "f", panelOptions: { priority: 5 } },
      { name: "n", panelOptions: { priority: 2 } },
      { name: "F", panelOptions: { priority: 7 } },
    ];
    const sortedPanels = panels.sort(panelsCompareFn);
    expect(sortedPanels.map((panel) => panel.name).join("")).toEqual(
      "FiftyOne"
    );
  });
});

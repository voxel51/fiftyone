import { describe, expect, it, vi } from "vitest";

import {
  allocatePointCloudCanvasBudget,
  PointCloudCanvasBudget,
} from "./point-cloud-canvas-budget";

describe("point-cloud canvas budget", () => {
  it("caps the sum across layers and redistributes unused shares", () => {
    const allocation = allocatePointCloudCanvasBudget(
      [
        { id: "small", pointCount: 10 },
        { id: "large-a", pointCount: 1_000 },
        { id: "large-b", pointCount: 1_000 },
      ],
      110,
    );

    expect(allocation).toEqual(
      new Map([
        ["small", 10],
        ["large-a", 50],
        ["large-b", 50],
      ]),
    );
  });

  it("uses weights while preserving the exact global cap", () => {
    const allocation = allocatePointCloudCanvasBudget(
      [
        { id: "focused", pointCount: 1_000, weight: 3 },
        { id: "secondary", pointCount: 1_000, weight: 1 },
      ],
      101,
    );

    expect(allocation.get("focused")).toBe(76);
    expect(allocation.get("secondary")).toBe(25);
  });

  it("shares one budget across independently registered canvas views", () => {
    const budget = new PointCloudCanvasBudget(120);
    const listener = vi.fn();
    budget.subscribe(listener);

    budget.updateView("large-view", {
      area: 300,
      demands: [{ id: "lidar", pointCount: 1_000 }],
    });
    budget.updateView("small-view", {
      area: 100,
      demands: [{ id: "lidar", pointCount: 1_000 }],
    });

    expect(budget.allocation("large-view").get("lidar")).toBe(90);
    expect(budget.allocation("small-view").get("lidar")).toBe(30);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

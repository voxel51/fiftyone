/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SaveHealth } from "../persistence";
import { SaveStatusIndicator } from "./SaveStatusIndicator";

const labelOf = (container: HTMLElement): string =>
  container.querySelector('[role="status"]')?.getAttribute("aria-label") ?? "";

describe("SaveStatusIndicator", () => {
  it("shows the last synced time", () => {
    const savedAt = new Date("2026-07-07T14:34:07").getTime();
    const { container } = render(
      <SaveStatusIndicator health={SaveHealth.Healthy} lastSavedAt={savedAt} />,
    );

    expect(labelOf(container)).toContain("Last synced at");
    expect(labelOf(container)).toMatch(/34/);
  });

  it("falls back to the current time before the first save", () => {
    const { container } = render(
      <SaveStatusIndicator health={SaveHealth.Healthy} lastSavedAt={null} />,
    );
    expect(labelOf(container)).toContain("Last synced at");
  });

  it("applies the pulse class to the icon only when in flight", () => {
    const { container, rerender } = render(
      <SaveStatusIndicator health={SaveHealth.Healthy} pulsing={false} />,
    );
    const iconClass = () =>
      container.querySelector("svg")?.getAttribute("class") ?? "";
    const idleClass = iconClass();

    rerender(<SaveStatusIndicator health={SaveHealth.Healthy} pulsing />);
    const pulsingClass = iconClass();

    expect(pulsingClass).not.toBe(idleClass);
    expect(pulsingClass.length).toBeGreaterThan(idleClass.length);
  });
});

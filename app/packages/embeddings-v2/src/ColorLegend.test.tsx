// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColorLegend } from "./ColorLegend";
import type { ColorMeta } from "./protocol";

// RTL only auto-cleans up with vitest globals enabled; ours are off
afterEach(cleanup);

const meta: ColorMeta = {
  style: "categorical",
  classes: [
    { label: "cat", count: 10 },
    { label: "dog", count: 5 },
  ],
} as ColorMeta;

function renderLegend() {
  const onToggle = vi.fn();
  const onSolo = vi.fn();
  render(
    <ColorLegend
      field="label"
      meta={meta}
      offLabels={new Set()}
      onToggle={onToggle}
      onSolo={onSolo}
    />,
  );
  return { onToggle, onSolo };
}

describe("ColorLegend click handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defers a single click's toggle so an isolate never flashes it", () => {
    const { onToggle, onSolo } = renderLegend();

    fireEvent.click(screen.getByText("cat"), { detail: 1 });
    expect(onToggle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("cat");
    expect(onSolo).not.toHaveBeenCalled();
  });

  it("double click isolates and cancels the pending toggle", () => {
    const { onToggle, onSolo } = renderLegend();

    const row = screen.getByText("cat");
    fireEvent.click(row, { detail: 1 });
    fireEvent.click(row, { detail: 2 });

    vi.advanceTimersByTime(400);
    expect(onSolo).toHaveBeenCalledTimes(1);
    expect(onSolo).toHaveBeenCalledWith("cat");
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("rapid clicks on different rows toggle both", () => {
    // regression: a shared timer let a click on one row cancel another
    // row's pending toggle, silently dropping the first action
    const { onToggle, onSolo } = renderLegend();

    fireEvent.click(screen.getByText("cat"), { detail: 1 });
    fireEvent.click(screen.getByText("dog"), { detail: 1 });

    vi.advanceTimersByTime(400);
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onToggle).toHaveBeenCalledWith("cat");
    expect(onToggle).toHaveBeenCalledWith("dog");
    expect(onSolo).not.toHaveBeenCalled();
  });

  it("keyboard activation toggles immediately", () => {
    // Enter/Space on a button fires a click with detail 0; no double
    // press exists on that path, so there is nothing to wait for
    const { onToggle } = renderLegend();

    fireEvent.click(screen.getByText("dog"), { detail: 0 });
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("dog");
  });
});

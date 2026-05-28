import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import TimelineHeader from "./TimelineHeader";

/**
 * Provides a stable ref the ruler needs. The element doesn't need to be
 * the rendered tree — it only matters that the ref is valid.
 */
function HeaderHarness({
  onToggle,
  labelWidth = 100,
  duration = 10,
}: {
  onToggle?: () => void;
  labelWidth?: number;
  duration?: number;
}) {
  const zoomRef = useRef<HTMLDivElement>(null);
  return (
    <PlaybackProvider duration={duration} stepInterval={1 / 30}>
      <div ref={zoomRef}>
        <TimelineHeader
          labelWidth={labelWidth}
          zoomRef={zoomRef}
          onToggle={onToggle}
        />
      </div>
    </PlaybackProvider>
  );
}

describe("TimelineHeader", () => {
  afterEach(() => cleanup());

  it("renders the controls row (play / step buttons) and the ruler", () => {
    render(<HeaderHarness />);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Step back" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Step forward" })).toBeTruthy();
    expect(screen.getByTestId("timeline-ruler")).not.toBeNull();
  });

  it("renders the PlayheadTime readout (proxied through TimelineControls)", () => {
    render(<HeaderHarness duration={5} />);
    expect(screen.getByText("0:00.00 / 0:05.00")).toBeTruthy();
  });

  it("forwards onToggle: clicking the controls row outside a button fires it", () => {
    const onToggle = vi.fn();
    render(<HeaderHarness onToggle={onToggle} />);
    // Click the divider — the only inert filler inside the row.
    // Targeting by data-testid avoids hitting any aria-hidden svg
    // children of the voodo Buttons (which would route the click into
    // the button and short-circuit the row handler).
    fireEvent.click(screen.getByTestId("timeline-controls-divider"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("clicking a button in the controls row does NOT fire onToggle", () => {
    const onToggle = vi.fn();
    render(<HeaderHarness onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("passes labelWidth down to the ruler", () => {
    render(<HeaderHarness labelWidth={150} />);
    // The ruler renders a labelSpacer div whose inline width === labelWidth.
    const spacer = screen.getByTestId("timeline-ruler-label-spacer");
    expect(spacer.getAttribute("style") ?? "").toContain("width: 150px");
  });

  it("renders the controls row and the ruler in document order", () => {
    render(<HeaderHarness />);
    const root = screen.getByTestId("timeline-header-root");
    // Controls (root has class "root" with border-bottom) is the first
    // child; ruler is the second.
    const children = Array.from(root.children);
    expect(children).toHaveLength(2);
    expect(children[0].querySelector('[aria-label="Play"]')).not.toBeNull();
    // Ruler is now wrapped in a position:relative rulerRow div.
    expect(
      children[1].querySelector('[data-testid="timeline-ruler"]')
    ).not.toBeNull();
  });
});

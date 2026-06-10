import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { useRef } from "react";
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
  rulerOverlay,
  extraControls,
  extraActions,
  children,
}: {
  onToggle?: () => void;
  labelWidth?: number;
  duration?: number;
  rulerOverlay?: React.ReactNode;
  extraControls?: React.ReactNode;
  extraActions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const zoomRef = useRef<HTMLDivElement>(null);
  return (
    <PlaybackProvider duration={duration} stepInterval={1 / 30}>
      <div ref={zoomRef}>
        <TimelineHeader
          labelWidth={labelWidth}
          zoomRef={zoomRef}
          onToggle={onToggle}
          rulerOverlay={rulerOverlay}
          extraControls={extraControls}
          extraActions={extraActions}
        >
          {children}
        </TimelineHeader>
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
    expect(children[1].getAttribute("data-testid")).toBe("timeline-ruler");
  });

  it("renders rulerOverlay inside the ruler's DOM node", () => {
    render(
      <HeaderHarness
        rulerOverlay={<div data-testid="my-overlay">overlay</div>}
      />
    );
    const ruler = screen.getByTestId("timeline-ruler");
    expect(ruler.querySelector('[data-testid="my-overlay"]')).not.toBeNull();
  });

  it("forwards extraControls to the controls row", () => {
    render(<HeaderHarness extraControls={<button>Toolbar</button>} />);
    expect(screen.getByRole("button", { name: "Toolbar" })).toBeTruthy();
  });

  it("forwards extraActions to the controls row", () => {
    render(<HeaderHarness extraActions={<button>Tag Mode</button>} />);
    expect(screen.getByRole("button", { name: "Tag Mode" })).toBeTruthy();
  });

  it("renders children in the belowRuler slot when provided", () => {
    render(
      <HeaderHarness>
        <div data-testid="pinned-section">pinned tracks</div>
      </HeaderHarness>
    );
    expect(screen.getByTestId("pinned-section")).toBeTruthy();
    // The root should gain a third child (the belowRuler wrapper).
    const root = screen.getByTestId("timeline-header-root");
    expect(root.children).toHaveLength(3);
  });

  it("does not render the belowRuler slot when children is absent", () => {
    render(<HeaderHarness />);
    const root = screen.getByTestId("timeline-header-root");
    expect(root.children).toHaveLength(2);
  });
});

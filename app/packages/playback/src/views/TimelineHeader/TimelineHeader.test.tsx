import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import TimelineHeader from "./TimelineHeader";
import styles from "./TimelineHeader.module.css";

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
    const { container } = render(<HeaderHarness />);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Step back" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Step forward" })).toBeTruthy();
    expect(container.querySelector(`.${rulerStyles.ruler}`)).not.toBeNull();
  });

  it("renders the PlayheadTime readout (proxied through TimelineControls)", () => {
    render(<HeaderHarness duration={5} />);
    expect(screen.getByText("0:00.00 / 0:05.00")).toBeTruthy();
  });

  it("forwards onToggle: clicking the controls row outside a button fires it", () => {
    const onToggle = vi.fn();
    const { container } = render(<HeaderHarness onToggle={onToggle} />);
    const divider = container.querySelector('[aria-hidden="true"]');
    expect(divider).not.toBeNull();
    fireEvent.click(divider!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("clicking a button in the controls row does NOT fire onToggle", () => {
    const onToggle = vi.fn();
    render(<HeaderHarness onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("passes labelWidth down to the ruler", () => {
    const { container } = render(<HeaderHarness labelWidth={150} />);
    // The ruler renders a labelSpacer div whose inline width === labelWidth.
    const spacer = container.querySelector(`.${rulerStyles.labelSpacer}`) as HTMLElement;
    expect(spacer).not.toBeNull();
    expect(spacer.getAttribute("style") ?? "").toContain("width: 150px");
  });

  it("renders the controls row and the ruler in document order", () => {
    const { container } = render(<HeaderHarness />);
    const root = container.querySelector(`.${styles.root}`);
    expect(root).not.toBeNull();
    // Controls (root has class "root" with border-bottom) is the first
    // child; ruler is the second.
    const children = Array.from(root!.children);
    expect(children).toHaveLength(2);
    expect(children[0].querySelector('[aria-label="Play"]')).not.toBeNull();
    expect(children[1].classList.contains("ruler")).toBe(true);
  });
});

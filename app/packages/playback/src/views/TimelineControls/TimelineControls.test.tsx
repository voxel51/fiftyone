import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import TimelineControls from "./TimelineControls";
import styles from "./TimelineControls.module.css";

interface RenderOpts {
  duration?: number;
  defaultLoopStart?: number;
  defaultLoopEnd?: number;
  onToggle?: () => void;
}

function renderControls(opts: RenderOpts = {}) {
  const { duration = 10, defaultLoopStart, defaultLoopEnd, onToggle } = opts;
  return render(
    <PlaybackProvider
      duration={duration}
      stepInterval={1 / 30}
      defaultLoopStart={defaultLoopStart}
      defaultLoopEnd={defaultLoopEnd}
    >
      <TimelineControls onToggle={onToggle} />
    </PlaybackProvider>,
  );
}

describe("TimelineControls", () => {
  afterEach(() => cleanup());

  it("renders step-back, play, and step-forward buttons", () => {
    renderControls();
    expect(screen.getByRole("button", { name: "Step back" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Step forward" })).toBeTruthy();
  });

  it("renders the PlayheadTime readout", () => {
    renderControls({ duration: 4 });
    expect(screen.getByText("0:00.00 / 0:04.00")).toBeTruthy();
  });

  it("does not render LoopBounds when the loop spans the full timeline", () => {
    renderControls({ duration: 10 });
    expect(screen.queryByTitle("Reset loop start to 0")).toBeNull();
    expect(screen.queryByTitle("Reset loop end to duration")).toBeNull();
  });

  it("renders LoopBounds when the loop has moved off the edges", () => {
    renderControls({ duration: 10, defaultLoopStart: 2, defaultLoopEnd: 7 });
    expect(screen.getByText("2.00s")).toBeTruthy();
    expect(screen.getByText("7.00s")).toBeTruthy();
  });

  it("clicking play toggles isPlaying — the button label flips to Pause", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  it("clicking pause toggles back to Play", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("clicking step forward advances the playhead by stepInterval", () => {
    renderControls({ duration: 10 });
    fireEvent.click(screen.getByRole("button", { name: "Step forward" }));
    // stepInterval is 1/30; PlayheadTime renders centiseconds.
    // 1/30 ≈ 0.0333 → cs = floor(3.33) = 3 → "0:00.03"
    expect(screen.getByText("0:00.03 / 0:10.00")).toBeTruthy();
  });

  it("clicking step back from 0 stays clamped at 0", () => {
    renderControls({ duration: 10 });
    fireEvent.click(screen.getByRole("button", { name: "Step back" }));
    expect(screen.getByText("0:00.00 / 0:10.00")).toBeTruthy();
  });

  it("step forward then step back returns to the original time", () => {
    renderControls({ duration: 10 });
    const fwd = screen.getByRole("button", { name: "Step forward" });
    fireEvent.click(fwd);
    fireEvent.click(fwd);
    expect(screen.getByText("0:00.06 / 0:10.00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Step back" }));
    expect(screen.getByText("0:00.03 / 0:10.00")).toBeTruthy();
  });

  it("invokes onToggle when the row is clicked outside a button", () => {
    const onToggle = vi.fn();
    renderControls({ onToggle });
    // Click the divider — it's the only inert filler inside the row that
    // isn't a button. Targeting by data-testid avoids hitting any
    // aria-hidden svg children of the voodo Buttons.
    fireEvent.click(screen.getByTestId("timeline-controls-divider"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does NOT invoke onToggle when a button inside the row is clicked", () => {
    const onToggle = vi.fn();
    renderControls({ onToggle });
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("applies the .clickable class only when onToggle is provided", () => {
    renderControls({ onToggle: vi.fn() });
    expect(
      screen
        .getByTestId("timeline-controls-root")
        .classList.contains(styles.clickable),
    ).toBe(true);

    cleanup();
    renderControls({});
    expect(
      screen
        .getByTestId("timeline-controls-root")
        .classList.contains(styles.clickable),
    ).toBe(false);
  });

  it("renders without crashing when onToggle is omitted and the row is clicked", () => {
    renderControls({});
    const row = screen.getByTestId("timeline-controls-root");
    expect(() => fireEvent.click(row)).not.toThrow();
  });

  describe("extraControls", () => {
    it("renders slotted content when provided", () => {
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TimelineControls extraControls={<button>Custom Action</button>} />
        </PlaybackProvider>,
      );
      expect(
        screen.getByRole("button", { name: "Custom Action" }),
      ).toBeTruthy();
    });

    it("renders the slot without introducing an extra divider", () => {
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TimelineControls
            extraControls={<span data-testid="slot">hi</span>}
          />
        </PlaybackProvider>,
      );
      // extraControls sits between the transport buttons and the time display;
      // unlike extraActions it does not add its own divider.
      const dividers = screen.getAllByTestId("timeline-controls-divider");
      expect(dividers).toHaveLength(1);
    });

    it("renders a single divider when no slot is provided", () => {
      renderControls({});
      const dividers = screen.getAllByTestId("timeline-controls-divider");
      expect(dividers).toHaveLength(1);
    });
  });

  describe("extraActions", () => {
    it("renders slotted content when provided", () => {
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TimelineControls extraActions={<button>Trailing Action</button>} />
        </PlaybackProvider>,
      );
      expect(
        screen.getByRole("button", { name: "Trailing Action" }),
      ).toBeTruthy();
    });

    it("introduces its own leading divider", () => {
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TimelineControls extraActions={<span data-testid="slot">hi</span>} />
        </PlaybackProvider>,
      );
      // extraActions renders far-right, preceded by a second divider.
      const dividers = screen.getAllByTestId("timeline-controls-divider");
      expect(dividers).toHaveLength(2);
    });
  });
});

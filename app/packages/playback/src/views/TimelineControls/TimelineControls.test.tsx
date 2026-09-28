import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import { usePlaybackStore } from "../../lib/playback/playback-store-context";
import {
  setBufferingDetail,
  setBufferingStreams,
  setIsBuffering,
} from "../../lib/playback/store-access";
import type { BufferingStream } from "../../lib/playback/types";
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

function BufferingFixture({
  streams,
}: {
  readonly streams: readonly BufferingStream[];
}) {
  const store = usePlaybackStore();
  // This effect publishes the buffering snapshot exercised by the controls.
  useEffect(() => {
    const ready = streams.filter((stream) => stream.state === "ready").length;
    setBufferingDetail(store, `${ready}/${streams.length} streams`);
    setBufferingStreams(store, streams);
    setIsBuffering(store, true);
  }, [store, streams]);
  return null;
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

  describe("keyboard playback shortcuts", () => {
    // Bindings dispatch through the CommandContextManager singleton's
    // document-level keydown listener, so events are fired on document
    // descendants and assertions await the async command execution.

    it("space toggles play and pause", async () => {
      renderControls();
      fireEvent.keyDown(document.body, { key: " " });
      expect(await screen.findByRole("button", { name: "Pause" })).toBeTruthy();
      fireEvent.keyDown(document.body, { key: " " });
      expect(await screen.findByRole("button", { name: "Play" })).toBeTruthy();
    });

    it("'.' steps forward and ',' steps back one tick", async () => {
      renderControls({ duration: 10 });
      fireEvent.keyDown(document.body, { key: "." });
      expect(await screen.findByText("0:00.03 / 0:10.00")).toBeTruthy();
      fireEvent.keyDown(document.body, { key: "," });
      expect(await screen.findByText("0:00.00 / 0:10.00")).toBeTruthy();
    });

    it("ignores modified variants (shift+space, meta+.)", async () => {
      renderControls({ duration: 10 });
      fireEvent.keyDown(document.body, { key: " ", shiftKey: true });
      fireEvent.keyDown(document.body, { key: ".", metaKey: true });
      // Flush the manager's async command path before asserting nothing moved.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
      expect(screen.getByText("0:00.00 / 0:10.00")).toBeTruthy();
    });

    it("space over the controls row toggles playback, not the drawer", async () => {
      const onToggle = vi.fn();
      renderControls({ onToggle });
      const row = screen.getByTestId("timeline-controls-root");
      fireEvent.keyDown(row, { key: " " });
      expect(await screen.findByRole("button", { name: "Pause" })).toBeTruthy();
      expect(onToggle).not.toHaveBeenCalled();
    });

    it("the controls row is not a tab stop", () => {
      const onToggle = vi.fn();
      renderControls({ onToggle });
      const row = screen.getByTestId("timeline-controls-root");
      // A focusable row drew a focus ring around the entire bar. Toggling by
      // keyboard goes through the chevron button instead.
      expect(row.getAttribute("tabindex")).toBeNull();
      expect(row.getAttribute("role")).toBeNull();
    });

    it("exposes the toggle as a real button, so Enter/Space activate it", () => {
      const onToggle = vi.fn();
      renderControls({ onToggle });
      const toggle = screen.getByTestId("timeline-controls-toggle");

      // Keyboard activation is the browser's, not ours: a <button> gets
      // Enter/Space for free, which is the whole reason the row itself no
      // longer needs to be a tab stop. jsdom does not implement that
      // activation behavior (a synthetic Enter keydown fires no click), so
      // asserting the element type is what actually guards the contract —
      // swapping in a <div role="button"> would silently lose the keyboard
      // path. The e2e suite drives the real activation in a browser.
      expect(toggle.tagName).toBe("BUTTON");
      expect((toggle as HTMLButtonElement).disabled).toBe(false);

      fireEvent.click(toggle);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("space types normally in a text input instead of toggling playback", async () => {
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TimelineControls />
          <input data-testid="text-field" />
        </PlaybackProvider>,
      );
      const input = screen.getByTestId("text-field");
      input.focus();
      fireEvent.keyDown(input, { key: " " });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    });
  });

  describe("buffering indicator", () => {
    it("is hidden while no stream is buffering", () => {
      renderControls();
      expect(screen.queryByTestId("timeline-controls-buffering")).toBeNull();
    });

    it("shows blocking stream readiness on hover", () => {
      const streams: readonly BufferingStream[] = [
        {
          id: "channel-26",
          label: "/camera/front/image",
          state: "ready",
        },
        { id: "channel-35", label: "/lidar/points", state: "waiting" },
      ];
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <BufferingFixture streams={streams} />
          <TimelineControls />
        </PlaybackProvider>,
      );

      const indicator = screen.getByTestId("timeline-controls-buffering");
      expect(indicator.textContent).toContain("Buffering 1/2 streams");
      expect(screen.queryByText("Playback streams")).toBeNull();

      fireEvent.mouseEnter(indicator.parentElement as HTMLElement);

      expect(screen.getByText("Playback streams")).toBeTruthy();
      expect(screen.getByText("1 waiting · 1 ready")).toBeTruthy();
      expect(screen.getByText("/lidar/points")).toBeTruthy();
      expect(screen.getByText("/camera/front/image")).toBeTruthy();
      expect(screen.queryByText("channel-26")).toBeNull();
      expect(screen.queryByText("channel-35")).toBeNull();
      expect(screen.getByText("Waiting")).toBeTruthy();
      expect(screen.getByText("Ready")).toBeTruthy();
    });
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

    it("renders the slot in the trailing run, behind its own divider", () => {
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TimelineControls
            extraControls={<span data-testid="slot">hi</span>}
          />
        </PlaybackProvider>,
      );
      // The row groups as: transport | audio | speed + clock | host content.
      // `extraControls` now shares the last group with `extraActions`, so it
      // sits behind the second divider rather than ahead of the first.
      const dividers = screen.getAllByTestId("timeline-controls-divider");
      expect(dividers).toHaveLength(2);
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

    it("stays inline rather than moving to the right edge", () => {
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TimelineControls
            onToggle={vi.fn()}
            extraActions={<span data-testid="slot">clock</span>}
          />
        </PlaybackProvider>,
      );
      // Readouts (e.g. the multimodal absolute-timestamp) belong with the
      // other controls on the left, NOT in the right-edge trailing group.
      expect(
        screen.queryByTestId("timeline-controls-trailing-actions"),
      ).toBeNull();
      expect(screen.getByTestId("slot")).toBeTruthy();
    });
  });

  describe("trailingActions", () => {
    it("renders slotted content pinned to the right", () => {
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TimelineControls
            trailingActions={<button>Trailing Action</button>}
          />
        </PlaybackProvider>,
      );
      expect(
        screen.getByRole("button", { name: "Trailing Action" }),
      ).toBeTruthy();
    });

    // The rule now sits AFTER the actions, separating them from the drawer
    // chevron. `TimelineWithTracks` renders no chevron when there are no
    // tracks while still forwarding `trailingActions` — Explore always
    // supplies them — so an ungated rule would hang off the right edge with
    // nothing after it.
    it("separates the actions from the chevron when one is present", () => {
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TimelineControls
            onToggle={vi.fn()}
            trailingActions={<button>Trailing Action</button>}
          />
        </PlaybackProvider>,
      );
      // The always-on leading rule, plus the one before the chevron.
      expect(screen.getAllByTestId("timeline-controls-divider")).toHaveLength(
        2,
      );
    });

    it("omits the trailing rule when there is no chevron", () => {
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TimelineControls
            trailingActions={<button>Trailing Action</button>}
          />
        </PlaybackProvider>,
      );
      expect(screen.queryByTestId("timeline-controls-toggle")).toBeNull();
      // Only the leading rule survives.
      expect(screen.getAllByTestId("timeline-controls-divider")).toHaveLength(
        1,
      );
    });

    it("groups the buttons ahead of the toggle chevron", () => {
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TimelineControls
            onToggle={vi.fn()}
            trailingActions={<button>Trailing Action</button>}
          />
        </PlaybackProvider>,
      );

      const actions = screen.getByTestId("timeline-controls-trailing-actions");
      const toggle = screen.getByTestId("timeline-controls-toggle");
      // The chevron always sits last so its position doesn't shift as
      // callers add or remove actions.
      expect(
        actions.compareDocumentPosition(toggle) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  describe("drawer toggle chevron", () => {
    it("renders only when onToggle is provided", () => {
      renderControls({});
      expect(screen.queryByTestId("timeline-controls-toggle")).toBeNull();

      cleanup();
      renderControls({ onToggle: vi.fn() });
      expect(screen.getByTestId("timeline-controls-toggle")).toBeTruthy();
    });

    it("reports the collapsed state via aria-expanded and its label", () => {
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TimelineControls onToggle={vi.fn()} expanded={false} />
        </PlaybackProvider>,
      );

      const toggle = screen.getByTestId("timeline-controls-toggle");
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(screen.getByRole("button", { name: "Show tracks" })).toBeTruthy();
    });

    it("reports the expanded state and rotates the chevron", () => {
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TimelineControls onToggle={vi.fn()} expanded />
        </PlaybackProvider>,
      );

      const toggle = screen.getByTestId("timeline-controls-toggle");
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByRole("button", { name: "Hide tracks" })).toBeTruthy();
      // One rotated icon rather than two swapped ones, so the change animates.
      expect(toggle.classList.contains(styles.toggleExpanded)).toBe(true);
    });

    it("fires onToggle exactly once when the chevron is clicked", () => {
      const onToggle = vi.fn();
      render(
        <PlaybackProvider duration={10} stepInterval={1 / 30}>
          <TimelineControls onToggle={onToggle} />
        </PlaybackProvider>,
      );

      fireEvent.click(screen.getByTestId("timeline-controls-toggle"));

      // The row's own handler ignores clicks on buttons, so the chevron's
      // handler is the only one that runs — no double toggle.
      expect(onToggle).toHaveBeenCalledOnce();
    });
  });
});

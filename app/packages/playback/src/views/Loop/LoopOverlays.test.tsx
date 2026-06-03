import { cleanup, render } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import { usePlaybackStore } from "../../lib/playback/playback-store-context";
import { viewEndAtom, viewStartAtom } from "../../lib/playback/atoms";
import LoopOverlays from "./LoopOverlays";
import styles from "./LoopOverlays.module.css";

/**
 * Drives the view atoms (no provider-prop shortcut for view bounds).
 * Writes the playback store's view atoms directly rather than going
 * through `usePlayback().setView`, because the public setter rejects
 * inverted/collapsed windows — and the "zero-width view" tests below
 * need to put the engine into exactly that state to exercise the
 * components' internal defensive paths.
 */
function ViewSetter({ start, end }: { start: number; end: number }) {
  const store = usePlaybackStore();
  useEffect(() => {
    store.set(viewStartAtom, start);
    store.set(viewEndAtom, end);
  }, [store, start, end]);
  return null;
}

interface RenderOpts {
  duration: number;
  defaultLoopStart?: number;
  defaultLoopEnd?: number;
  viewStart?: number;
  viewEnd?: number;
  labelWidth?: number;
}

function renderOverlays(opts: RenderOpts) {
  const labelWidth = opts.labelWidth ?? 100;
  return render(
    <PlaybackProvider
      duration={opts.duration}
      stepInterval={1 / 30}
      defaultLoopStart={opts.defaultLoopStart}
      defaultLoopEnd={opts.defaultLoopEnd}
    >
      {opts.viewStart !== undefined && opts.viewEnd !== undefined ? (
        <ViewSetter start={opts.viewStart} end={opts.viewEnd} />
      ) : null}
      <LoopOverlays labelWidth={labelWidth} />
    </PlaybackProvider>
  );
}

// CSS modules hash class names at build time — `.mask` literal misses
// the hashed name `LoopOverlays__mask__abc123`. Use the imported module.
const maskClass = `.${styles.mask}`;

// LoopOverlays positions its masks using CSS `calc()` strings. JSDOM's
// CSSOM rejects those values and they get stripped from the inline style
// attribute, so we can't reliably assert on the math here — render-logic
// (which masks appear, with what visible attributes) is what these tests
// cover. Positioning math is covered by a unit test on
// `utils/timeline-utils.ts::laneLeftCalc`.

describe("LoopOverlays", () => {
  afterEach(() => cleanup());

  it("renders nothing when the loop spans the full view", () => {
    const { container } = renderOverlays({ duration: 10 });
    expect(container.querySelectorAll(maskClass)).toHaveLength(0);
  });

  it("renders only the left mask when loop start is moved past view start", () => {
    const { container } = renderOverlays({
      duration: 10,
      defaultLoopStart: 2.5,
    });
    const masks = container.querySelectorAll(maskClass);
    expect(masks).toHaveLength(1);
    // The left mask is the only one that does NOT anchor with `right`.
    expect(masks[0].getAttribute("style") ?? "").not.toContain("right");
  });

  it("renders only the right mask when loop end is moved before view end", () => {
    const { container } = renderOverlays({
      duration: 10,
      defaultLoopEnd: 7.5,
    });
    const masks = container.querySelectorAll(maskClass);
    expect(masks).toHaveLength(1);
    // The right mask anchors to `right: 0`.
    expect(masks[0].getAttribute("style") ?? "").toContain("right: 0");
  });

  it("renders both masks when both bounds are inset", () => {
    const { container } = renderOverlays({
      duration: 10,
      defaultLoopStart: 2,
      defaultLoopEnd: 8,
    });
    const masks = container.querySelectorAll(maskClass);
    expect(masks).toHaveLength(2);
    // Exactly one of the two carries `right: 0`.
    const withRight = Array.from(masks).filter((m) =>
      (m.getAttribute("style") ?? "").includes("right: 0")
    );
    expect(withRight).toHaveLength(1);
  });

  it("treats bounds within LOOP_EDGE_EPSILON (0.02) of the view edges as at the edge", () => {
    const { container } = renderOverlays({
      duration: 10,
      defaultLoopStart: 0.01,
      defaultLoopEnd: 9.99,
    });
    expect(container.querySelectorAll(maskClass)).toHaveLength(0);
  });

  it("renders the left mask when loop start is just past epsilon", () => {
    // 0.03 > 0.02 epsilon → left mask should render.
    const { container } = renderOverlays({
      duration: 10,
      defaultLoopStart: 0.03,
    });
    expect(container.querySelectorAll(maskClass)).toHaveLength(1);
  });

  it("renders nothing when the view collapses to a zero-width window", () => {
    // viewStart === viewEnd → no room for the loop to be inside, so the
    // bounds-vs-view comparison says both are at the edge.
    const { container } = renderOverlays({
      duration: 10,
      defaultLoopStart: 2,
      defaultLoopEnd: 5,
      viewStart: 5,
      viewEnd: 5,
    });
    expect(container.querySelectorAll(maskClass)).toHaveLength(0);
  });

  it("considers the loop relative to the view, not the duration", () => {
    // View [4, 8]; loop [5, 7] is inset on both sides → both masks render.
    const { container } = renderOverlays({
      duration: 10,
      defaultLoopStart: 5,
      defaultLoopEnd: 7,
      viewStart: 4,
      viewEnd: 8,
    });
    expect(container.querySelectorAll(maskClass)).toHaveLength(2);
  });

  it("renders nothing when the loop matches a sub-view exactly", () => {
    // View [4, 8] and loop [4, 8] → loop equals view, no masks needed.
    const { container } = renderOverlays({
      duration: 10,
      defaultLoopStart: 4,
      defaultLoopEnd: 8,
      viewStart: 4,
      viewEnd: 8,
    });
    expect(container.querySelectorAll(maskClass)).toHaveLength(0);
  });

  it("masks carry the .mask class for the shared overlay styling", () => {
    const { container } = renderOverlays({
      duration: 10,
      defaultLoopStart: 2,
      defaultLoopEnd: 8,
    });
    const masks = container.querySelectorAll(maskClass);
    expect(masks).toHaveLength(2);
    masks.forEach((m) => {
      expect(m.classList.contains(styles.mask)).toBe(true);
    });
  });
});

import { cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PlaybackProvider,
  usePlayback,
} from "../../lib/playback/PlaybackProvider";
import { usePlaybackStore } from "../../lib/playback/playback-store-context";
import { viewEndAtom, viewStartAtom } from "../../lib/playback/atoms";
import PlayheadLine from "./PlayheadLine";
import styles from "./PlayheadLine.module.css";

function Seeker({ time }: { time: number }) {
  const { seek } = usePlayback();
  useEffect(() => {
    seek(time);
    // seek is a referentially-stable Jotai setter from usePlayback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time]);
  return null;
}

/**
 * Writes the view atoms directly rather than going through
 * `usePlayback().setView` — the public setter rejects collapsed
 * windows, and the zero-width view test below specifically needs to
 * exercise the component's internal defense against `viewEnd ===
 * viewStart`.
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
  seekTo?: number;
  viewStart?: number;
  viewEnd?: number;
  labelWidth?: number;
}

function renderLine(opts: RenderOpts) {
  const labelWidth = opts.labelWidth ?? 100;
  return render(
    <PlaybackProvider duration={opts.duration} stepInterval={1 / 30}>
      {opts.viewStart !== undefined && opts.viewEnd !== undefined ? (
        <ViewSetter start={opts.viewStart} end={opts.viewEnd} />
      ) : null}
      {opts.seekTo !== undefined ? <Seeker time={opts.seekTo} /> : null}
      <PlayheadLine labelWidth={labelWidth} />
    </PlaybackProvider>,
  );
}

const inlineStyle = (el: Element): string => el.getAttribute("style") ?? "";

describe("PlayheadLine", () => {
  afterEach(() => cleanup());

  it("renders the outer/inner pair regardless of playhead position", () => {
    const { container } = renderLine({ duration: 10 });
    expect(container.querySelectorAll(`.${styles.outer}`)).toHaveLength(1);
    expect(container.querySelectorAll(`.${styles.line}`)).toHaveLength(1);
  });

  it("anchors at translate3d(0%, 0, 0) when playhead is at view start", () => {
    const { container } = renderLine({ duration: 10 });
    const outer = container.querySelector(`.${styles.outer}`);
    expect(outer).not.toBeNull();
    expect(inlineStyle(outer!)).toContain("translate3d(0%");
  });

  it("translates by the playhead's fraction of the view duration", () => {
    // 2.5s into a 10s timeline → 25%.
    const { container } = renderLine({ duration: 10, seekTo: 2.5 });
    const outer = container.querySelector(`.${styles.outer}`);
    expect(inlineStyle(outer!)).toContain("translate3d(25%");
  });

  it("clamps the playhead to 100% when it sits past the view end", () => {
    // seek() clamps to duration; the ratio still works out to 1.
    const { container } = renderLine({ duration: 10, seekTo: 10 });
    const outer = container.querySelector(`.${styles.outer}`);
    expect(inlineStyle(outer!)).toContain("translate3d(100%");
  });

  it("computes the ratio relative to the view window, not the timeline", () => {
    // View [4, 8] (duration 4). seek(5) → (5 - 4) / 4 = 25%.
    const { container } = renderLine({
      duration: 10,
      seekTo: 5,
      viewStart: 4,
      viewEnd: 8,
    });
    const outer = container.querySelector(`.${styles.outer}`);
    expect(inlineStyle(outer!)).toContain("translate3d(25%");
  });

  it("clamps to 0% when the playhead sits before the view window", () => {
    // View [4, 8], seek(1) → ratio would be negative; clamps to 0.
    const { container } = renderLine({
      duration: 10,
      seekTo: 1,
      viewStart: 4,
      viewEnd: 8,
    });
    const outer = container.querySelector(`.${styles.outer}`);
    expect(inlineStyle(outer!)).toContain("translate3d(0%");
  });

  it("renders at 0% when the view collapses to zero width", () => {
    const { container } = renderLine({
      duration: 10,
      seekTo: 5,
      viewStart: 5,
      viewEnd: 5,
    });
    const outer = container.querySelector(`.${styles.outer}`);
    expect(inlineStyle(outer!)).toContain("translate3d(0%");
  });

  it("offsets the outer by labelWidth", () => {
    const { container } = renderLine({ duration: 10, labelWidth: 250 });
    const outer = container.querySelector(`.${styles.outer}`);
    expect(inlineStyle(outer!)).toContain("left: 250px");
  });
});

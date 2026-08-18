import type { Meta, StoryObj } from "@storybook/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import { TrackProvider, type Track } from "../../lib/tracks/TrackProvider";
import type { TimelineTrackProps } from "../TimelineTrack/TimelineTrack";
import TimelineWithTracks, {
  type TimelineTracksScroller,
} from "./TimelineWithTracks";

/**
 * Load harness for the virtualized tracks drawer.
 *
 * The point of these stories is to make the virtualization falsifiable: the
 * readout reports how many rows the flattened list holds versus how many are
 * actually in the DOM, and how many `decorateTrack` calls the last second
 * cost. If virtualization is working those two row counts diverge wildly
 * (~25 mounted against 10,000) and the decorate rate sits at zero while
 * idle. If it regresses, they converge and the frame rate collapses — which
 * is exactly the failure this story exists to catch.
 */
const meta: Meta<typeof TimelineWithTracks> = {
  title: "Playback/Components/TimelineWithTracks",
  component: TimelineWithTracks,
};
export default meta;

type Story = StoryObj<typeof TimelineWithTracks>;

/** Deterministic PRNG so two runs of the same args are comparable. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = [
  "#4a9eff",
  "#ff6b6b",
  "#f8a4cc",
  "#a3e7a3",
  "#ff7c4a",
  "#c9a4ff",
  "#ffd166",
  "#4ad6c4",
];

/** Long enough to force the label column to its ellipsis / drag ceiling. */
const CLASSES = [
  "person",
  "vehicle",
  "traffic light",
  "construction barrel with a very long class name",
  "bicycle",
  "road sign",
];

const ATTRIBUTES = ["occluded", "truncated", "confidence"];

interface GenerateOptions {
  trackCount: number;
  subTracksPerParent: number;
  eventsPerTrack: number;
  durationSec: number;
}

/**
 * Build a flat track list shaped like the video-annotation surface: an object
 * track per instance, immediately followed by its dynamic-attribute sub-rows
 * (linked by `parentId`). Flat is the point — a group's children are ordinary
 * rows in the same list, so they virtualize with everything else rather than
 * riding along inside a group that renders them all at once.
 */
function generateTracks({
  trackCount,
  subTracksPerParent,
  eventsPerTrack,
  durationSec,
}: GenerateOptions): Track[] {
  const rand = mulberry32(0x51c0de);
  const tracks: Track[] = [];

  for (let i = 0; i < trackCount; i++) {
    const color = PALETTE[i % PALETTE.length];
    const klass = CLASSES[i % CLASSES.length];
    const parentId = `instance-${i}`;

    // Non-overlapping presence bars marching across the timeline.
    const events = [];
    for (let e = 0; e < eventsPerTrack; e++) {
      const slot = (durationSec / eventsPerTrack) * e;
      const start = slot + rand() * (durationSec / eventsPerTrack) * 0.3;
      const end = start + (durationSec / eventsPerTrack) * 0.4;
      events.push({ startSec: start, endSec: Math.min(end, durationSec) });
    }

    tracks.push({
      id: parentId,
      label: `${klass} ${i}`,
      color,
      events,
    });

    for (let s = 0; s < subTracksPerParent; s++) {
      tracks.push({
        id: `${parentId}::${ATTRIBUTES[s % ATTRIBUTES.length]}`,
        parentId,
        label: ATTRIBUTES[s % ATTRIBUTES.length],
        color,
        // Sub-rows are value-segmented: same spans, per-segment colors.
        events: events.map((ev, k) => ({
          ...ev,
          color: k % 2 === 0 ? color : "#7a7a7a",
        })),
      });
    }
  }

  return tracks;
}

interface HarnessArgs extends GenerateOptions {
  pinnedCount: number;
}

/** Live readout: mounted rows, decorate rate, and frame rate. */
function Readout({
  totalRows,
  decorateCountRef,
  onScrollToRandom,
}: {
  totalRows: number;
  decorateCountRef: React.MutableRefObject<number>;
  onScrollToRandom: () => void;
}) {
  const [mountedRows, setMountedRows] = useState(0);
  const [decoratesPerSec, setDecoratesPerSec] = useState(0);
  const [fps, setFps] = useState(0);

  // Frame rate, sampled continuously — the number that actually degrades when
  // every row is mounted.
  useEffect(() => {
    let frames = 0;
    let raf = 0;
    let last = performance.now();

    const tick = () => {
      frames += 1;
      const now = performance.now();
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        setMountedRows(document.querySelectorAll("[data-track-id]").length);
        setDecoratesPerSec(decorateCountRef.current);
        decorateCountRef.current = 0;
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [decorateCountRef]);

  const cell: React.CSSProperties = { padding: "2px 12px 2px 0" };
  const value: React.CSSProperties = {
    ...cell,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "8px 12px",
        font: "12px/1.4 ui-monospace, monospace",
        background: "var(--color-content-bg-card-1)",
        color: "var(--color-content-text-primary)",
        borderBottom: "1px solid var(--color-content-border-subtle)",
      }}
    >
      <span>
        <span style={cell}>rows in list</span>
        <span style={value}>{totalRows.toLocaleString()}</span>
      </span>
      <span>
        <span style={cell}>rows in DOM</span>
        <span style={value}>{mountedRows.toLocaleString()}</span>
      </span>
      <span>
        <span style={cell}>decorateTrack/s</span>
        <span style={value}>{decoratesPerSec.toLocaleString()}</span>
      </span>
      <span>
        <span style={cell}>fps</span>
        <span style={{ ...value, color: fps < 45 ? "#ff6b6b" : undefined }}>
          {fps}
        </span>
      </span>
      <button
        type="button"
        onClick={onScrollToRandom}
        style={{ marginLeft: "auto" }}
      >
        scroll to random track
      </button>
    </div>
  );
}

function Harness({
  trackCount,
  subTracksPerParent,
  eventsPerTrack,
  durationSec,
  pinnedCount,
}: HarnessArgs) {
  const tracks = useMemo(
    () =>
      generateTracks({
        trackCount,
        subTracksPerParent,
        eventsPerTrack,
        durationSec,
      }),
    [trackCount, subTracksPerParent, eventsPerTrack, durationSec],
  );

  const initialPinnedIds = useMemo(
    () => Array.from({ length: pinnedCount }, (_, i) => `instance-${i}`),
    [pinnedCount],
  );

  const scroller = useRef<TimelineTracksScroller | null>(null);
  // Counts decorate calls between readout samples — the per-row work that
  // virtualization is meant to skip.
  const decorateCountRef = useRef(0);

  const decorateTrack = useCallback(
    (track: Track): Partial<TimelineTrackProps> => {
      decorateCountRef.current += 1;
      // Mirror the annotation surface's shape: children render indented and
      // shorter, parents reserve the chevron gutter so labels stay aligned.
      return track.parentId
        ? { depth: 1, isChild: true, height: 22, expansionGutter: true }
        : { expansionGutter: true };
    },
    [],
  );

  const scrollToRandom = useCallback(() => {
    const target = tracks[Math.floor(Math.random() * tracks.length)];
    scroller.current?.scrollToTrack(target.id);
    // eslint-disable-next-line no-console
    console.log("scrollToTrack", target.id, target.label);
  }, [tracks]);

  return (
    <PlaybackProvider duration={durationSec} stepInterval={1 / 30}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          height: "100vh",
          background: "var(--color-content-bg-background)",
        }}
      >
        <Readout
          totalRows={tracks.length}
          decorateCountRef={decorateCountRef}
          onScrollToRandom={scrollToRandom}
        />
        <div style={{ marginTop: "auto" }}>
          <TrackProvider
            tracks={tracks}
            initialPinnedIds={initialPinnedIds}
            autoPinNewTracks={false}
          >
            <TimelineWithTracks
              defaultDrawerOpen
              decorateTrack={decorateTrack}
              scrollerRef={scroller}
            />
          </TrackProvider>
        </div>
      </div>
    </PlaybackProvider>
  );
}

const argTypes = {
  trackCount: { control: { type: "number", min: 0, step: 100 } },
  subTracksPerParent: { control: { type: "number", min: 0, max: 3 } },
  eventsPerTrack: { control: { type: "number", min: 1, max: 40 } },
  durationSec: { control: { type: "number", min: 1 } },
  pinnedCount: { control: { type: "number", min: 0, max: 20 } },
};

/**
 * ~10k rows: 3,334 object tracks, each with two attribute sub-rows. Open the
 * drawer and scroll — "rows in DOM" should stay in the twenties and
 * `decorateTrack/s` should fall to zero the moment you stop.
 */
export const TenThousandTracks: Story = {
  argTypes,
  args: {
    trackCount: 3334,
    subTracksPerParent: 2,
    eventsPerTrack: 4,
    durationSec: 600,
    pinnedCount: 3,
  },
  render: (args) => <Harness {...(args as unknown as HarnessArgs)} />,
};

/**
 * Same 10k rows with a heavy event load — 40 presence bars per row, i.e. a
 * ~400k-element timeline if every row were mounted. This is where the cost of
 * a non-virtualized list stops being subtle.
 */
export const TenThousandTracksHeavyEvents: Story = {
  argTypes,
  args: {
    trackCount: 3334,
    subTracksPerParent: 2,
    eventsPerTrack: 40,
    durationSec: 600,
    pinnedCount: 3,
  },
  render: (args) => <Harness {...(args as unknown as HarnessArgs)} />,
};

/** A realistic small sample, for comparing against the loaded cases. */
export const Handful: Story = {
  argTypes,
  args: {
    trackCount: 8,
    subTracksPerParent: 1,
    eventsPerTrack: 4,
    durationSec: 60,
    pinnedCount: 2,
  },
  render: (args) => <Harness {...(args as unknown as HarnessArgs)} />,
};

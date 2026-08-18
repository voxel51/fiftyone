import type { Track } from "./TrackProvider";

/**
 * TEMPORARY DEV HARNESS — delete before merging.
 *
 * Injects synthetic tracks into any `TrackProvider` so the timeline can be
 * exercised at a scale no real sample reaches. Drive it from the URL:
 *
 *   ?spoofTracks=10000              10k rows
 *   ?spoofTracks=10000&spoofEvents=40   …with 40 presence bars each
 *   ?spoofTracks=10000&spoofChildren=2  …with 2 sub-rows per parent
 *
 * Because it lives in the provider rather than in a feature package, the same
 * query param works on every surface that renders `TimelineWithTracks` — the
 * video-annotation drawer and the multimodal episode viewer alike.
 */

/** Query param that turns the harness on, and its companions. */
const COUNT_PARAM = "spoofTracks";
const EVENTS_PARAM = "spoofEvents";
const CHILDREN_PARAM = "spoofChildren";

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

/**
 * Deliberately mixed lengths — the label column sizes itself to the widest
 * label it has actually mounted, so a uniform set wouldn't exercise it.
 */
const CLASSES = [
  "person",
  "vehicle",
  "traffic light",
  "construction barrel with a deliberately very long class name",
  "bicycle",
  "road sign",
];

const ATTRIBUTES = ["occluded", "truncated", "confidence"];

/** Deterministic PRNG so two runs at the same count are comparable. */
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

function readNumberParam(name: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;

  const raw = new URLSearchParams(window.location.search).get(name);
  if (raw === null) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export interface SpoofConfig {
  /** Parent rows to generate. `0` disables the harness entirely. */
  count: number;
  /** Interval events per row. */
  eventsPerTrack: number;
  /** Sub-rows per parent, linked by `parentId`. */
  childrenPerTrack: number;
}

/** Read the harness config off the URL. `count: 0` means "off". */
export function readSpoofConfig(): SpoofConfig {
  return {
    count: readNumberParam(COUNT_PARAM, 0),
    eventsPerTrack: readNumberParam(EVENTS_PARAM, 4),
    childrenPerTrack: readNumberParam(CHILDREN_PARAM, 2),
  };
}

/**
 * Longest end time across the real tracks, so the spoofed events land inside
 * the same window the ruler is showing. Falls back to a minute when there's
 * nothing real to measure against.
 */
function spanOf(tracks: readonly Track[]): number {
  let span = 0;
  for (const track of tracks) {
    for (const event of track.events) {
      span = Math.max(span, event.endSec ?? event.startSec);
    }
  }

  return span > 0 ? span : 60;
}

/**
 * Generate `config.count` parent rows, each immediately followed by its
 * sub-rows — the same flat, parent-then-children ordering the annotation
 * surface produces, so the spoofed rows exercise the grouping path rather
 * than a simplified one.
 */
export function generateSpoofTracks(
  real: readonly Track[],
  config: SpoofConfig,
): Track[] {
  const { count, eventsPerTrack, childrenPerTrack } = config;
  if (count <= 0) return [];

  const rand = mulberry32(0x51c0de);
  const duration = spanOf(real);
  const slot = duration / Math.max(1, eventsPerTrack);
  const spoofed: Track[] = [];

  for (let i = 0; i < count; i++) {
    const color = PALETTE[i % PALETTE.length];
    const parentId = `spoof-${i}`;

    const events = [];
    for (let e = 0; e < eventsPerTrack; e++) {
      const startSec = slot * e + rand() * slot * 0.3;
      events.push({
        startSec,
        endSec: Math.min(startSec + slot * 0.4, duration),
      });
    }

    spoofed.push({
      id: parentId,
      label: `${CLASSES[i % CLASSES.length]} ${i}`,
      color,
      events,
    });

    for (let c = 0; c < childrenPerTrack; c++) {
      spoofed.push({
        id: `${parentId}::${ATTRIBUTES[c % ATTRIBUTES.length]}`,
        parentId,
        label: ATTRIBUTES[c % ATTRIBUTES.length],
        color,
        // Value-segmented, like a real dynamic-attribute sub-row.
        events: events.map((event, k) => ({
          ...event,
          color: k % 2 === 0 ? color : "#7a7a7a",
        })),
      });
    }
  }

  return spoofed;
}

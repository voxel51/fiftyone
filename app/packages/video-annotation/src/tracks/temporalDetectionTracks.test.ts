import { describe, expect, it, vi } from "vitest";
import {
  buildTemporalDetectionTracks,
  type RawTemporalDetectionsField,
} from "./temporalDetectionTracks";

const DEFAULT_FPS = 30;

function makeTd(
  id: string,
  support: [number, number],
  label = "running",
  extras: Record<string, unknown> = {},
) {
  return {
    _cls: "TemporalDetection" as const,
    _id: id,
    label,
    support,
    confidence: 0.9,
    ...extras,
  };
}

function makeField(
  ...detections: ReturnType<typeof makeTd>[]
): RawTemporalDetectionsField {
  return { _cls: "TemporalDetections", detections };
}

const passthroughColor = (path: string) => `color-${path}`;

describe("buildTemporalDetectionTracks", () => {
  describe("happy path", () => {
    it("emits one track per TD with an interval event spanning support", () => {
      const tracks = buildTemporalDetectionTracks({
        sample: {
          events: makeField(makeTd("a", [1, 30], "running")),
        },
        fps: DEFAULT_FPS,
        resolveColor: passthroughColor,
      });

      expect(tracks).toHaveLength(1);
      const t = tracks[0];
      expect(t.id).toBe("td-events-a");
      expect(t.color).toBe("color-events");
      expect(t.events).toHaveLength(1);

      const ev = t.events[0];
      expect(ev.startSec).toBeCloseTo(0); // (1-1)/30
      expect(ev.endSec).toBeCloseTo(30 / 30); // 30/30 = 1s
      expect(ev.label).toBe("running");
    });

    it("converts 1-indexed inclusive frame support to seconds correctly", () => {
      // support = [16, 45] on a 30fps clip:
      //   startSec = (16 - 1) / 30 = 0.5
      //   endSec   = 45 / 30 = 1.5
      const tracks = buildTemporalDetectionTracks({
        sample: { events: makeField(makeTd("a", [16, 45])) },
        fps: 30,
        resolveColor: passthroughColor,
      });
      const ev = tracks[0].events[0];
      expect(ev.startSec).toBeCloseTo(0.5);
      expect(ev.endSec).toBeCloseTo(1.5);
    });

    it("marks emitted interval events as resizable for in-place edit", () => {
      const tracks = buildTemporalDetectionTracks({
        sample: { events: makeField(makeTd("a", [1, 10])) },
        fps: DEFAULT_FPS,
        resolveColor: passthroughColor,
      });
      const event = tracks[0].events[0] as { resizable?: boolean };
      expect(event.resizable).toBe(true);
    });

    it("attaches a TemporalDetectionEventData payload to each event", () => {
      const td = makeTd("abc", [10, 20], "walking");
      const tracks = buildTemporalDetectionTracks({
        sample: { events: makeField(td) },
        fps: DEFAULT_FPS,
        resolveColor: passthroughColor,
      });
      const data = tracks[0].events[0].data as {
        fieldPath: string;
        detectionId: string;
        detectionIndex: number;
        support: [number, number];
        raw: typeof td;
      };

      expect(data.fieldPath).toBe("events");
      expect(data.detectionId).toBe("abc");
      expect(data.detectionIndex).toBe(0);
      expect(data.support).toEqual([10, 20]);
      expect(data.raw).toBe(td);
    });

    it("returns a row label combining the TD label and field path", () => {
      const tracks = buildTemporalDetectionTracks({
        sample: { events: makeField(makeTd("a", [1, 10], "running")) },
        fps: DEFAULT_FPS,
        resolveColor: passthroughColor,
      });
      expect(tracks[0].label).toBe("running (events)");
    });

    it("falls back to a truncated id label when the TD has no label string", () => {
      const tracks = buildTemporalDetectionTracks({
        sample: { events: makeField(makeTd("0123456789abcdef", [1, 10], "")) },
        fps: DEFAULT_FPS,
        resolveColor: passthroughColor,
      });
      expect(tracks[0].label).toBe("events 89abcdef");
    });

    it("falls back to `id` when `_id` is missing", () => {
      const td = {
        _cls: "TemporalDetection" as const,
        id: "x1",
        label: "j",
        support: [1, 5] as [number, number],
      };
      const tracks = buildTemporalDetectionTracks({
        sample: {
          events: { _cls: "TemporalDetections" as const, detections: [td] },
        },
        fps: DEFAULT_FPS,
        resolveColor: passthroughColor,
      });
      expect(tracks).toHaveLength(1);
      expect(tracks[0].id).toBe("td-events-x1");
    });
  });

  describe("color resolution", () => {
    it("calls resolveColor with the field path and a label-like dict", () => {
      const resolveColor = vi.fn(() => "#abc");
      buildTemporalDetectionTracks({
        sample: { events: makeField(makeTd("a", [1, 5], "running")) },
        fps: DEFAULT_FPS,
        resolveColor,
      });

      expect(resolveColor).toHaveBeenCalledTimes(1);
      expect(resolveColor).toHaveBeenCalledWith("events", {
        _cls: "TemporalDetection",
        label: "running",
        id: "a",
      });
    });
  });

  describe("multiple fields and detections", () => {
    it("emits tracks for every TemporalDetections field on the sample", () => {
      const tracks = buildTemporalDetectionTracks({
        sample: {
          events: makeField(makeTd("a", [1, 10])),
          highlights: makeField(makeTd("b", [5, 15])),
        },
        fps: DEFAULT_FPS,
        resolveColor: passthroughColor,
      });
      expect(tracks).toHaveLength(2);
      const ids = tracks.map((t) => t.id);
      expect(ids).toContain("td-events-a");
      expect(ids).toContain("td-highlights-b");
    });

    it("orders TDs within a field by support start, with id as tie-break", () => {
      const tracks = buildTemporalDetectionTracks({
        sample: {
          events: makeField(
            makeTd("z", [10, 20]),
            makeTd("a", [1, 5]),
            makeTd("m", [10, 30]),
          ),
        },
        fps: DEFAULT_FPS,
        resolveColor: passthroughColor,
      });
      expect(tracks.map((t) => t.id)).toEqual([
        "td-events-a",
        "td-events-m",
        "td-events-z",
      ]);
    });
  });

  describe("filtering invalid entries", () => {
    it("skips TDs with missing support", () => {
      const td = { _cls: "TemporalDetection" as const, _id: "a", label: "x" };
      const tracks = buildTemporalDetectionTracks({
        sample: {
          events: { _cls: "TemporalDetections" as const, detections: [td] },
        },
        fps: DEFAULT_FPS,
        resolveColor: passthroughColor,
      });
      expect(tracks).toEqual([]);
    });

    it("skips TDs with malformed support (wrong length, NaN, inverted)", () => {
      const tracks = buildTemporalDetectionTracks({
        sample: {
          events: makeField(
            {
              ...makeTd("a", [1, 5]),
              support: [1] as unknown as [number, number],
            },
            { ...makeTd("b", [1, 5]), support: [NaN, 10] },
            { ...makeTd("c", [1, 5]), support: [20, 10] },
          ),
        },
        fps: DEFAULT_FPS,
        resolveColor: passthroughColor,
      });
      expect(tracks).toEqual([]);
    });

    it("skips TDs missing both _id and id", () => {
      const td = {
        _cls: "TemporalDetection" as const,
        label: "x",
        support: [1, 5] as [number, number],
      };
      const tracks = buildTemporalDetectionTracks({
        sample: {
          events: { _cls: "TemporalDetections" as const, detections: [td] },
        },
        fps: DEFAULT_FPS,
        resolveColor: passthroughColor,
      });
      expect(tracks).toEqual([]);
    });

    it("ignores fields that aren't TemporalDetections", () => {
      const tracks = buildTemporalDetectionTracks({
        sample: {
          detections: { _cls: "Detections", detections: [] },
          metadata: { frame_rate: 30 },
          some_string: "hello",
          some_array: [1, 2, 3],
          some_null: null,
        },
        fps: DEFAULT_FPS,
        resolveColor: passthroughColor,
      });
      expect(tracks).toEqual([]);
    });

    it("emits TD tracks when sibling Detection / Classification fields are also active", () => {
      // Reproduces the schema shape that surfaces during the bug: a sample-level
      // Classification (`_cls: "Classification"`) sits alongside the TD field
      // and a sibling per-frame Detection field. The producer must walk past
      // the non-TD fields and still emit the TD track — the Classification is
      // not a TD wrapper and never generates a timeline lane of its own.
      const tracks = buildTemporalDetectionTracks({
        sample: {
          // Active per-frame Detection field — populated, but it lives under
          // `frames.*` in real data; the producer ignores it either way.
          "frames.detections": {
            _cls: "Detections",
            detections: [{ _cls: "Detection", _id: "d1", label: "person" }],
          },
          // Active sample-level Classification field — must not produce a row
          // and must not interfere with TD field discovery.
          classification: { _cls: "Classification", _id: "c1", label: "kiss" },
          // Active TD field — the row that the bug dropped.
          events: makeField(makeTd("td1", [10, 25], "running")),
        },
        fps: DEFAULT_FPS,
        resolveColor: passthroughColor,
      });

      expect(tracks).toHaveLength(1);
      expect(tracks[0].id).toBe("td-events-td1");
      expect(tracks[0].label).toBe("running (events)");
    });

    it("tolerates a TemporalDetections field with an empty detections list", () => {
      const tracks = buildTemporalDetectionTracks({
        sample: { events: makeField() },
        fps: DEFAULT_FPS,
        resolveColor: passthroughColor,
      });
      expect(tracks).toEqual([]);
    });

    it("tolerates a TemporalDetections field with missing detections array", () => {
      const tracks = buildTemporalDetectionTracks({
        sample: {
          events: { _cls: "TemporalDetections" as const },
        },
        fps: DEFAULT_FPS,
        resolveColor: passthroughColor,
      });
      // Not a valid TemporalDetections field per our type-guard (detections
      // is required); should be ignored.
      expect(tracks).toEqual([]);
    });
  });

  describe("guards", () => {
    it("returns [] for an empty sample", () => {
      expect(
        buildTemporalDetectionTracks({
          sample: {},
          fps: DEFAULT_FPS,
          resolveColor: passthroughColor,
        }),
      ).toEqual([]);
    });

    it("returns [] when fps is not finite or non-positive", () => {
      const sample = { events: makeField(makeTd("a", [1, 5])) };
      expect(
        buildTemporalDetectionTracks({
          sample,
          fps: 0,
          resolveColor: passthroughColor,
        }),
      ).toEqual([]);
      expect(
        buildTemporalDetectionTracks({
          sample,
          fps: -10,
          resolveColor: passthroughColor,
        }),
      ).toEqual([]);
      expect(
        buildTemporalDetectionTracks({
          sample,
          fps: Number.NaN,
          resolveColor: passthroughColor,
        }),
      ).toEqual([]);
    });
  });
});

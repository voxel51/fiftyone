import { describe, expect, it } from "vitest";
import {
  buildTemporalTagTracks,
  isTemporalTagTrackId,
  temporalTagNanoseconds,
  temporalTagTrackId,
  type TemporalTagInterval,
} from "./temporal-tag-tracks";

const SECOND = 1_000_000_000;

const interval = (
  overrides: Partial<TemporalTagInterval> & Pick<TemporalTagInterval, "id">,
): TemporalTagInterval => ({
  tag: "review",
  start: SECOND,
  end: 2 * SECOND,
  ...overrides,
});

const colorForTag = (tag: string) => `#${tag}`;

describe("buildTemporalTagTracks", () => {
  it("collects every interval carrying a value onto that value's row", () => {
    const tracks = buildTemporalTagTracks(
      [
        interval({ id: "a", tag: "review", start: 0, end: SECOND }),
        interval({ id: "b", tag: "blurry" }),
        interval({
          id: "c",
          tag: "review",
          start: 4 * SECOND,
          end: 6 * SECOND,
        }),
      ],
      colorForTag,
    );

    expect(tracks.map((track) => track.id)).toEqual(
      expect.arrayContaining([
        temporalTagTrackId("review"),
        temporalTagTrackId("blurry"),
      ]),
    );

    const review = tracks.find(
      (track) => track.id === temporalTagTrackId("review"),
    );
    expect(review?.color).toBe("#review");
    expect(review?.events.map((event) => event.data)).toEqual(["a", "c"]);
  });

  it("converts the stored nanoseconds to timeline seconds", () => {
    const [track] = buildTemporalTagTracks(
      [interval({ id: "a", start: 1_500_000_000, end: 3_250_000_000 })],
      colorForTag,
    );

    expect(track.events[0]).toMatchObject({ startSec: 1.5, endSec: 3.25 });
  });

  it("orders rows by their newest interval so a fresh tag lands on top", () => {
    const tracks = buildTemporalTagTracks(
      [
        interval({ id: "a", tag: "old", createdAt: "2026-01-01T00:00:00Z" }),
        interval({ id: "b", tag: "new", createdAt: "2026-06-01T00:00:00Z" }),
        interval({ id: "c", tag: "old", createdAt: "2026-03-01T00:00:00Z" }),
      ],
      colorForTag,
    );

    expect(tracks.map((track) => track.label)).toEqual(["new", "old"]);
  });
});

describe("temporal tag track ids", () => {
  it("recognises the ids it mints, and nothing else", () => {
    expect(isTemporalTagTrackId(temporalTagTrackId("review"))).toBe(true);
    expect(isTemporalTagTrackId("frames.detections::instance-1")).toBe(false);
  });
});

describe("temporalTagNanoseconds", () => {
  it("rounds to whole nanoseconds, which is all the routes store", () => {
    expect(temporalTagNanoseconds(1.2345678901)).toBe(1234567890);
  });
});

import type { Track } from "@fiftyone/playback";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTimelineSections } from "./sections";
import type { TimelineSection } from "./types";

const TAG_TRACK: Track = {
  id: "temporal-tag::one",
  label: "Tag",
  color: "#000",
  events: [],
};
const EVENT_TRACK: Track = {
  id: "test-event::one",
  label: "Event",
  color: "#111",
  events: [],
};
const TAGS_HEADER_ID = "timeline-section::fiftyone:temporal-tags";
const EVENTS_HEADER_ID = "timeline-section::test:events";

describe("useTimelineSections", () => {
  it("keeps a single section as real tracks only", () => {
    const { result } = renderHook(() =>
      useTimelineSections([section("fiftyone:temporal-tags", 200, TAG_TRACK)]),
    );

    expect(result.current.tracks).toEqual([TAG_TRACK]);
  });

  it("orders multiple sections behind non-pinnable synthetic headers", () => {
    const { result } = renderHook(() =>
      useTimelineSections([
        section("fiftyone:temporal-tags", 200, TAG_TRACK),
        section("test:events", 100, EVENT_TRACK),
      ]),
    );

    expect(result.current.tracks.map((track) => track.id)).toEqual([
      EVENTS_HEADER_ID,
      EVENT_TRACK.id,
      TAGS_HEADER_ID,
      TAG_TRACK.id,
    ]);
    const header = result.current.tracks[0];
    const decoration = result.current.decorateTrack(header, false);
    expect(decoration).toMatchObject({
      expandable: true,
      expanded: true,
      expansionGutter: true,
      onPinClick: undefined,
    });
  });

  it("collapses only unpinned children and preserves source decoration", () => {
    const sections: TimelineSection[] = [
      section("fiftyone:temporal-tags", 200, TAG_TRACK),
      {
        ...section("test:events", 100, EVENT_TRACK),
        decorateTrack: () => ({
          className: "source-row",
          depth: 2,
          eventMenuItems: [],
        }),
      },
    ];
    const { result } = renderHook(() => useTimelineSections(sections));
    const header = result.current.tracks.find(
      (track) => track.id === EVENTS_HEADER_ID,
    );
    if (!header) throw new Error("missing section header");

    act(() => result.current.decorateTrack(header, false).onToggleExpand?.());

    expect(result.current.decorateTrack(header, false).expanded).toBe(false);
    const unpinned = result.current.decorateTrack(EVENT_TRACK, false);
    expect(unpinned).toMatchObject({
      depth: 2,
      eventMenuItems: [],
      expansionGutter: true,
    });
    expect(unpinned.className).toContain("source-row");
    expect(unpinned.className).toMatch(/hiddenTrack/);
    expect(result.current.decorateTrack(EVENT_TRACK, true)).toEqual({
      className: "source-row",
      depth: 2,
      eventMenuItems: [],
    });
  });

  it("rejects duplicate sections, tracks, and header collisions", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      expect(() =>
        renderHook(() =>
          useTimelineSections([
            section("test:duplicate", 100, EVENT_TRACK),
            section("test:duplicate", 200, TAG_TRACK),
          ]),
        ),
      ).toThrow("Duplicate Timeline section id: test:duplicate");

      expect(() =>
        renderHook(() =>
          useTimelineSections([
            section("test:events", 100, EVENT_TRACK),
            section("fiftyone:temporal-tags", 200, EVENT_TRACK),
          ]),
        ),
      ).toThrow(`Duplicate Timeline track id ${EVENT_TRACK.id}`);

      expect(() =>
        renderHook(() =>
          useTimelineSections([
            section("test:events", 100, EVENT_TRACK),
            section("fiftyone:temporal-tags", 200, {
              ...TAG_TRACK,
              id: EVENTS_HEADER_ID,
            }),
          ]),
        ),
      ).toThrow(
        `Timeline section header id collides with a track: ${EVENTS_HEADER_ID}`,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

function section(id: string, order: number, track: Track): TimelineSection {
  return { id, label: id, order, tracks: [track] };
}

import { describe, expect, it } from "vitest";
import {
  intervalPinnedTrackIds,
  intervalTimelineSections,
  intervalTrackId,
  intervalsToTracks,
} from "./intervals-to-tracks";
import type {
  EpisodeInterval,
  EpisodeIntervalSource,
  ResolvedEpisodeIntervals,
} from "./types";

const NS = 1_000_000_000;

const source = (
  id: string,
  label = id,
  order = 100,
): EpisodeIntervalSource => ({
  id,
  label,
  order,
  Component: () => null,
});

const interval = (
  sourceId: string,
  eventName: string,
  startSec: number,
  endSec: number,
  color = "#abc",
): EpisodeInterval => ({
  sourceId,
  eventName,
  color,
  startNs: startSec * NS,
  endNs: endSec * NS,
});

const resolved = (
  src: EpisodeIntervalSource,
  intervals: EpisodeInterval[],
  pinnedEventNames?: string[],
): ResolvedEpisodeIntervals => ({
  source: src,
  contribution: {
    intervals,
    ...(pinnedEventNames ? { pinnedEventNames } : {}),
  },
});

describe("intervalTrackId", () => {
  it("namespaces the name by its source", () => {
    expect(intervalTrackId("teams:events", "collision")).toBe(
      "teams:events::collision",
    );
  });

  it("keeps the same name on separate rows for separate sources", () => {
    // useTimelineSections rejects duplicate track ids, so two sources using one
    // name must not collide.
    expect(intervalTrackId("a:x", "n")).not.toBe(intervalTrackId("b:y", "n"));
  });
});

describe("intervalsToTracks", () => {
  const events = source("teams:events", "Events");

  it("makes one track per distinct name, in alphabetical order", () => {
    const tracks = intervalsToTracks(
      resolved(events, [
        interval("teams:events", "zebra", 0, 1),
        interval("teams:events", "apple", 2, 3),
      ]),
    );

    expect(tracks.map((track) => track.label)).toEqual(["apple", "zebra"]);
    expect(tracks.map((track) => track.id)).toEqual([
      "teams:events::apple",
      "teams:events::zebra",
    ]);
  });

  it("gathers every occurrence of a name onto its own track, earliest first", () => {
    const [track] = intervalsToTracks(
      resolved(events, [
        interval("teams:events", "a", 30, 40),
        interval("teams:events", "a", 10, 20),
      ]),
    );

    expect(track.events).toEqual([
      { label: "a", startSec: 10, endSec: 20 },
      { label: "a", startSec: 30, endSec: 40 },
    ]);
  });

  it("converts nanoseconds to the seconds the timeline renders in", () => {
    const [track] = intervalsToTracks(
      resolved(events, [interval("teams:events", "a", 1.5, 2.25)]),
    );

    expect(track.events).toEqual([{ label: "a", startSec: 1.5, endSec: 2.25 }]);
  });

  it("takes the track colour from the name's first interval", () => {
    const [track] = intervalsToTracks(
      resolved(events, [
        interval("teams:events", "a", 0, 1, "#111"),
        interval("teams:events", "a", 2, 3, "#222"),
      ]),
    );

    expect(track.color).toBe("#111");
  });

  it("returns nothing for a source that contributed nothing", () => {
    expect(intervalsToTracks(resolved(events, []))).toEqual([]);
  });
});

describe("intervalPinnedTrackIds", () => {
  const events = source("teams:events");
  const signals = source("teams:signals");

  it("maps each source's pinned names through its own prefix", () => {
    expect(
      intervalPinnedTrackIds([
        resolved(events, [], ["a", "b"]),
        resolved(signals, [], ["c"]),
      ]),
    ).toEqual(["teams:events::a", "teams:events::b", "teams:signals::c"]);
  });

  it("produces ids for names with no interval yet", () => {
    // Pins are derived from the filter, not from loaded data, so they exist
    // before the intervals do — that is what lets a late track still pin.
    expect(intervalPinnedTrackIds([resolved(events, [], ["a"])])).toEqual([
      "teams:events::a",
    ]);
  });

  it("is empty when no source pinned anything", () => {
    expect(intervalPinnedTrackIds([resolved(events, [])])).toEqual([]);
  });
});

describe("intervalTimelineSections", () => {
  it("keeps each source's label and order", () => {
    const sections = intervalTimelineSections([
      resolved(source("teams:signals", "Signals", 220), [
        interval("teams:signals", "s", 0, 1),
      ]),
      resolved(source("teams:events", "Events", 210), [
        interval("teams:events", "e", 0, 1),
      ]),
    ]);

    expect(
      sections.map(({ id, label, order }) => ({ id, label, order })),
    ).toEqual([
      { id: "teams:signals", label: "Signals", order: 220 },
      { id: "teams:events", label: "Events", order: 210 },
    ]);
  });

  it("drops a source that produced no tracks", () => {
    // An empty section would otherwise count toward the threshold that decides
    // whether the drawer shows group headers at all.
    const sections = intervalTimelineSections([
      resolved(source("teams:events", "Events"), []),
      resolved(source("teams:signals", "Signals"), [
        interval("teams:signals", "s", 0, 1),
      ]),
    ]);

    expect(sections.map((section) => section.id)).toEqual(["teams:signals"]);
  });
});

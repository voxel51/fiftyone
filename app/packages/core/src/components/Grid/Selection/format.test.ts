import { describe, expect, it } from "vitest";
import {
  episodeTitle,
  formatBound,
  formatRanges,
  groupDescriptor,
  listRanges,
  rangeDomain,
  scopePhrase,
  selectionPills,
  streamsLabel,
  type SegmentMember,
} from "./format";

describe("scopePhrase", () => {
  const samples = { one: "sample", many: "samples", temporal: false };
  const counts = (fullEpisodes: number, segments = 0) => ({
    episodes: fullEpisodes,
    fullEpisodes,
    segments,
    segmentEpisodes: segments ? 1 : 0,
    unavailable: 0,
  });
  it("names every result or the selection, in the unit's own words", () => {
    expect(scopePhrase("results", counts(16), samples)).toBe(
      "all 16 samples in view",
    );
    expect(scopePhrase("explicit", counts(1), samples)).toBe(
      "1 selected sample",
    );
    expect(
      scopePhrase("explicit", counts(3), {
        one: "patch",
        many: "patches",
        temporal: false,
      }),
    ).toBe("3 selected patches");
    expect(
      scopePhrase("explicit", counts(1, 2), {
        one: "episode",
        many: "episodes",
        temporal: true,
      }),
    ).toMatch(/^selected 1 full episode · 2 segments/);
  });

  it("names the bucket an explicit scope came from, never the results scope", () => {
    expect(scopePhrase("explicit", counts(3), samples, "Keep")).toBe(
      "3 selected samples in Keep",
    );
    expect(scopePhrase("explicit", counts(1, 2), samples, "Unsure")).toMatch(
      /segments across 1 sample in Unsure$/,
    );
    expect(scopePhrase("results", counts(16), samples, "Keep")).toBe(
      "all 16 samples in view",
    );
  });
});

function segment(
  start: string,
  end: string,
  timebase = "sequence",
  streams = ["filepath"],
): SegmentMember {
  return {
    episodeId: "episode",
    kind: "segment",
    range: { start, end, timebase, streams, provenance: [] },
  };
}

describe("selectionPills", () => {
  const episodes = { one: "episode", many: "episodes", temporal: true };
  const clips = { one: "clip", many: "clips", temporal: false };
  it("names the exact unit for whole parents", () => {
    expect(
      selectionPills(
        {
          episodes: 4,
          fullEpisodes: 4,
          segments: 0,
          segmentEpisodes: 0,
          unavailable: 0,
        },
        clips,
      ),
    ).toEqual([
      { kind: "episode", count: 4, noun: "clips", detail: "4 clips" },
    ]);
    expect(
      selectionPills(
        {
          episodes: 1,
          fullEpisodes: 1,
          segments: 0,
          segmentEpisodes: 0,
          unavailable: 0,
        },
        episodes,
      ),
    ).toEqual([
      { kind: "episode", count: 1, noun: "episode", detail: "1 episode" },
    ]);
  });
  it("aggregates one pill per archetype when parents and segments mix", () => {
    expect(
      selectionPills(
        {
          episodes: 3,
          fullEpisodes: 2,
          segments: 3,
          segmentEpisodes: 1,
          unavailable: 0,
        },
        episodes,
      ),
    ).toEqual([
      {
        kind: "episode",
        count: 2,
        noun: "episodes",
        detail: "2 full episodes",
      },
      {
        kind: "segment",
        count: 3,
        noun: "segments",
        detail: "3 segments across 1 episode",
      },
    ]);
  });
});

describe("selection display formatting", () => {
  it("formats bounds per timebase without altering identity values", () => {
    expect(formatBound("1200", "sequence")).toBe("1,200");
    expect(formatBound("2500000000", "duration-ns")).toBe("0:02.5");
    expect(formatBound("3725000000000", "duration-ns")).toBe("1:02:05.0");
    expect(formatBound("1500000000000000000", "timestamp-ns")).toBe(
      "02:40:00.0",
    );
    expect(formatBound("abc", "sequence")).toBe("abc");
    expect(formatBound("7", "ticks")).toBe("7");
  });

  it("summarizes ranges in start order with units and an overflow count", () => {
    const members = [
      segment("60", "75"),
      segment("10", "30"),
      segment("100", "120"),
      segment("200", "210"),
    ];
    expect(formatRanges(members, 2)).toBe("10–30, 60–75 +2 more frames");
    expect(listRanges(members)).toEqual([
      "10–30 frames",
      "60–75 frames",
      "100–120 frames",
      "200–210 frames",
    ]);
    expect(formatRanges([segment("0", "1000000000", "duration-ns")])).toBe(
      "0:00.0–0:01.0",
    );
  });

  it("describes cards and stream scope", () => {
    expect(
      groupDescriptor({ members: [{ episodeId: "e", kind: "episode" }] }),
    ).toBe("Full episode");
    expect(
      groupDescriptor({ members: [segment("0", "1"), segment("5", "9")] }),
    ).toBe("2 segments");
    expect(streamsLabel([segment("0", "1")])).toBeNull();
    expect(
      streamsLabel([segment("0", "1", "duration-ns", ["lerobot:cam.side"])]),
    ).toBe("cam.side");
    expect(
      streamsLabel([
        segment("0", "1", "duration-ns", ["a"]),
        segment("2", "3", "duration-ns", ["b"]),
      ]),
    ).toBe("2 streams");
  });

  it("titles episodes by media file name and falls back to the id", () => {
    expect(
      episodeTitle({ episodeId: "abcdef123456", filepath: "/x/y/drive.mp4" }),
    ).toBe("drive.mp4");
    expect(episodeTitle({ episodeId: "abcdef123456" })).toBe("Episode 123456");
  });

  it("computes one shared axis across several range sets", () => {
    expect(rangeDomain([[segment("10", "30")], [segment("0", "20")]])).toEqual([
      0n,
      30n,
    ]);
    expect(rangeDomain([[]])).toBeNull();
  });
});

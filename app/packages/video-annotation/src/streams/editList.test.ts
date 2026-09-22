/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { presentationStart, presentedInOrder } from "./editList";

describe("presentationStart", () => {
  it("is undefined without an edit list", () => {
    expect(presentationStart(undefined)).toBeUndefined();
    expect(presentationStart([])).toBeUndefined();
  });

  it("is the media_time of the first edit", () => {
    expect(
      presentationStart([{ segment_duration: 9120, media_time: 96000 }]),
    ).toBe(96000);
  });

  it("skips a leading empty edit", () => {
    expect(
      presentationStart([
        { segment_duration: 500, media_time: -1 },
        { segment_duration: 9120, media_time: 96000 },
      ]),
    ).toBe(96000);
  });

  it("is undefined when every edit is empty", () => {
    expect(
      presentationStart([{ segment_duration: 500, media_time: -1 }]),
    ).toBeUndefined();
  });
});

describe("presentedInOrder", () => {
  // 5 fps in a 1.2 MHz track timescale: one frame every 240000 ticks.
  const FRAME = 240000;
  const samples = [0, 1, 2, 3].map((i) => ({ cts: i * FRAME, id: i }));

  it("numbers every sample when there is no edit list", () => {
    expect(presentedInOrder(samples, undefined).map((s) => s.id)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("keeps negative-cts samples when there is no edit list", () => {
    // Signed composition offsets without an edit list: no boundary applies.
    const signed = [
      { cts: 0, id: "I" },
      { cts: 2 * FRAME, id: "P" },
      { cts: -FRAME, id: "B" },
    ];
    expect(presentedInOrder(signed, undefined).map((s) => s.id)).toEqual([
      "B",
      "I",
      "P",
    ]);
    // An explicit boundary at 0 still drops them.
    expect(presentedInOrder(signed, 0).map((s) => s.id)).toEqual(["I", "P"]);
  });

  it("drops samples before the presentation start as pre-roll", () => {
    // Edit list starts 0.08 s in: picture 1 (cts 0) is pre-roll, frame 1 is picture 2.
    expect(presentedInOrder(samples, 96000).map((s) => s.id)).toEqual([
      1, 2, 3,
    ]);
  });

  it("keeps a sample that starts exactly at the presentation start", () => {
    expect(presentedInOrder(samples, FRAME).map((s) => s.id)).toEqual([
      1, 2, 3,
    ]);
  });

  it("orders by composition time, not decode order", () => {
    // B-frame reordering: decode order I P B B, presentation order I B B P.
    const reordered = [
      { cts: 0, id: "I" },
      { cts: 3 * FRAME, id: "P" },
      { cts: 1 * FRAME, id: "B1" },
      { cts: 2 * FRAME, id: "B2" },
    ];
    expect(presentedInOrder(reordered, 0).map((s) => s.id)).toEqual([
      "I",
      "B1",
      "B2",
      "P",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [{ cts: FRAME }, { cts: 0 }];
    presentedInOrder(input, 0);
    expect(input.map((s) => s.cts)).toEqual([FRAME, 0]);
  });
});

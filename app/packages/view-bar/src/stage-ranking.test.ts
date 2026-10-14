import { beforeEach, describe, expect, it } from "vitest";

import {
  rankStages,
  readRecentStages,
  recordRecentStage,
} from "./stage-ranking";

const NAMES = [
  "Concat",
  "Exclude",
  "FilterLabels",
  "GeoNear",
  "Limit",
  "Match",
  "Mongo",
  "Skip",
];

describe("rankStages", () => {
  it("puts common stages before the alphabetical remainder", () => {
    expect(rankStages(NAMES, [])).toEqual([
      "Match",
      "FilterLabels",
      "Limit",
      "Skip",
      "Concat",
      "Exclude",
      "GeoNear",
      "Mongo",
    ]);
  });

  it("puts recent stages first, in recency order", () => {
    expect(rankStages(NAMES, ["Mongo", "Limit"]).slice(0, 3)).toEqual([
      "Mongo",
      "Limit",
      "Match",
    ]);
  });

  it("ignores recent names that are not offered", () => {
    expect(rankStages(NAMES, ["ToFrames"])[0]).toBe("Match");
  });

  it("keeps the given order for unranked stages", () => {
    const tail = rankStages(NAMES, []).slice(-4);
    expect(tail).toEqual(["Concat", "Exclude", "GeoNear", "Mongo"]);
  });
});

describe("recent stage storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips through storage", () => {
    recordRecentStage("Limit");
    recordRecentStage("Match");
    expect(readRecentStages()).toEqual(["Match", "Limit"]);
  });

  it("moves a repeated stage to the front without duplicating", () => {
    recordRecentStage("Limit");
    recordRecentStage("Match");
    recordRecentStage("Limit");
    expect(readRecentStages()).toEqual(["Limit", "Match"]);
  });

  it("caps the list", () => {
    for (const name of ["A", "B", "C", "D", "E", "F"]) {
      recordRecentStage(name);
    }
    expect(readRecentStages()).toHaveLength(5);
    expect(readRecentStages()[0]).toBe("F");
  });

  it("survives garbage in storage", () => {
    window.localStorage.setItem("fo-view-bar-recent-stages", "{not json");
    expect(readRecentStages()).toEqual([]);
    window.localStorage.setItem("fo-view-bar-recent-stages", '{"a":1}');
    expect(readRecentStages()).toEqual([]);
    window.localStorage.setItem(
      "fo-view-bar-recent-stages",
      '["Limit", 3, null]',
    );
    expect(readRecentStages()).toEqual(["Limit"]);
  });
});

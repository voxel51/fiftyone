import { describe, expect, it } from "vitest";
import {
  capturesAnything,
  capturesMoreThanStages,
  describeDefinition,
  editedInfo,
  hasEdits,
  leastUsedColor,
  matchesSearch,
  nameProblem,
  type DefinitionParts,
  type SavedQuery,
} from "./model";

const query = (overrides: Partial<SavedQuery> = {}): SavedQuery => ({
  id: "1",
  name: "Night scenes",
  slug: "night-scenes",
  description: null,
  color: null,
  viewStages: [],
  ...overrides,
});

const NONE: DefinitionParts = {
  stages: 0,
  filters: false,
  sort: false,
  similarity: false,
  fieldVisibility: false,
  resultSelection: false,
  selectedSamples: 0,
};

describe("matchesSearch", () => {
  it("matches the name, slug, or description without case", () => {
    const night = query({ description: "Pedestrians after dark" });
    expect(matchesSearch(night, "NIGHT")).toBe(true);
    expect(matchesSearch(night, "night-sc")).toBe(true);
    expect(matchesSearch(night, "pedestrians")).toBe(true);
    expect(matchesSearch(night, "  ")).toBe(true);
    expect(matchesSearch(night, "daytime")).toBe(false);
  });
});

describe("nameProblem", () => {
  const queries = [query(), query({ id: "2", name: "Day", slug: "day" })];

  it("allows an empty draft and a fresh name", () => {
    expect(nameProblem(queries, "")).toBeNull();
    expect(nameProblem(queries, "Dusk")).toBeNull();
  });

  it("rejects names whose slug another query already uses", () => {
    expect(nameProblem(queries, "night  SCENES")).toBe(
      "“Night scenes” already uses this name",
    );
  });

  it("lets a renamed query keep its own slug", () => {
    expect(nameProblem(queries, "Night Scenes", "night-scenes")).toBeNull();
    expect(nameProblem(queries, "day", "night-scenes")).toBe(
      "“Day” already uses this name",
    );
  });

  it("rejects names without a usable slug", () => {
    expect(nameProblem(queries, "!!!")).toBe(
      "Use at least one letter or number",
    );
  });
});

describe("describeDefinition", () => {
  it("lists the stages and compiled state in order", () => {
    expect(
      describeDefinition({
        ...NONE,
        stages: 1,
        filters: true,
        sort: true,
        fieldVisibility: true,
        resultSelection: true,
        selectedSamples: 2,
        selectionUnit: { one: "episode", many: "episodes" },
      }),
    ).toBe(
      "1 stage · filters · sort · field visibility · selected results · 2 selected episodes",
    );
  });

  it("prefers the similarity sort over a field sort", () => {
    expect(
      describeDefinition({ ...NONE, stages: 3, sort: true, similarity: true }),
    ).toBe("3 stages · similarity sort");
  });
});

describe("capturesAnything", () => {
  it("is false for the bare dataset and true for a stage or any state", () => {
    expect(capturesAnything(NONE)).toBe(false);
    expect(capturesAnything({ ...NONE, stages: 1 })).toBe(true);
    expect(capturesAnything({ ...NONE, sort: true })).toBe(true);
    expect(capturesAnything({ ...NONE, selectedSamples: 1 })).toBe(true);
  });
});

describe("capturesMoreThanStages", () => {
  it("is false for stages alone and true once anything is added", () => {
    expect(capturesMoreThanStages({ ...NONE, stages: 4 })).toBe(false);
    expect(capturesMoreThanStages({ ...NONE, filters: true })).toBe(true);
    expect(capturesMoreThanStages({ ...NONE, selectedSamples: 1 })).toBe(true);
  });
});

describe("editedInfo", () => {
  it("keeps unset metadata unset when the draft leaves it alone", () => {
    const stored = query();
    const draft = { name: "Night scenes", description: "", color: "" };
    expect(editedInfo(stored, draft)).toEqual({
      name: "Night scenes",
      description: null,
      color: null,
    });
    expect(hasEdits(stored, draft)).toBe(false);
  });

  it("sends changed fields and trims the name", () => {
    const stored = query({ description: "old", color: "#123456" });
    const draft = { name: " Late ", description: "new", color: "#123456" };
    expect(editedInfo(stored, draft)).toEqual({
      name: "Late",
      description: "new",
      color: "#123456",
    });
    expect(hasEdits(stored, draft)).toBe(true);
  });
});

describe("leastUsedColor", () => {
  const palette = ["#2970FF", "#06AED4", "#16B364"];

  it("starts with the palette's first color", () => {
    expect(leastUsedColor([], palette)).toBe("#2970FF");
  });

  it("skips colors the dataset's queries already wear", () => {
    expect(
      leastUsedColor(
        [
          query({ color: "#2970ff" }),
          query({ color: "#16B364" }),
          query({ color: null }),
        ],
        palette,
      ),
    ).toBe("#06AED4");
  });
});

import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { setMockAtoms, TestSelector } from "../../../../__mocks__/recoil";
import * as color from "./color";

describe("temporalTagColor", () => {
  const resolver = <TestSelector<typeof color.temporalTagColor>>(
    (<unknown>color.temporalTagColor)
  );

  it("uses a configured color for a value, else the hashed fallback", () => {
    setMockAtoms({
      __colorScheme_selector: {
        temporalTags: {
          valueColors: [{ value: "pedestrian", color: "#3b82f6" }],
        },
      },
      // colorMap is a selector returning the fallback generator; the recoil
      // mock invokes this to produce the generator function.
      colorMap: () => (value: string) => `fallback:${value}`,
    });

    const colorFor = resolver();
    expect(colorFor("pedestrian")).toBe("#3b82f6");
    expect(colorFor("hard_brake")).toBe("fallback:hard_brake");
  });

  it("falls back for every value when nothing is configured", () => {
    setMockAtoms({
      __colorScheme_selector: { temporalTags: {} },
      colorMap: () => (value: string) => `fallback:${value}`,
    });

    const colorFor = resolver();
    expect(colorFor("pedestrian")).toBe("fallback:pedestrian");
    expect(colorFor("hard_brake")).toBe("fallback:hard_brake");
  });

  it("ignores color-by-field mode — always resolves by value", () => {
    setMockAtoms({
      // fieldColor set + colorBy "field" must NOT force one uniform color.
      __colorScheme_selector: {
        colorBy: "field",
        temporalTags: {
          fieldColor: "#000000",
          valueColors: [{ value: "pedestrian", color: "#3b82f6" }],
        },
      },
      colorMap: () => (value: string) => `fallback:${value}`,
    });

    const colorFor = resolver();
    expect(colorFor("pedestrian")).toBe("#3b82f6");
    expect(colorFor("hard_brake")).toBe("fallback:hard_brake");
  });
});

describe("valueColor", () => {
  const resolver = <TestSelector<typeof color.valueColor>>(
    (<unknown>color.valueColor)
  );

  const setScheme = (scheme: object, labelFields: readonly string[] = []) =>
    setMockAtoms({
      __colorScheme_selector: scheme,
      colorMap: () => (value: string) => `fallback:${value}`,
      // Which paths are label fields decides where the value colors for a
      // nested row are configured — see the label-field cases below.
      labelFields: () => labelFields,
      mediaType: "image",
      pathColor: (path: string) => `field:${path}`,
    });

  it("gives every value the field's color when coloring by field", () => {
    setScheme({
      colorBy: "field",
      fields: [
        {
          path: "events.collisions",
          valueColors: [{ value: "near_miss", color: "#3b82f6" }],
        },
      ],
    });

    const colorFor = resolver("events.collisions")();
    // The per-value setting is configuration for the other mode; in this one
    // the sidebar row and everything under it are one color.
    expect(colorFor("near_miss")).toBe("field:events.collisions");
    expect(colorFor("hard_brake")).toBe("field:events.collisions");
  });

  it("gives each value its own color when coloring by value", () => {
    setScheme({ colorBy: "value", fields: [] });

    const colorFor = resolver("events.collisions")();
    expect(colorFor("near_miss")).toBe("fallback:near_miss");
    expect(colorFor("hard_brake")).toBe("fallback:hard_brake");
  });

  it("prefers a value's configured color to the hashed fallback", () => {
    setScheme({
      colorBy: "value",
      fields: [
        {
          path: "events.collisions",
          valueColors: [{ value: "near_miss", color: "#3b82f6" }],
        },
      ],
    });

    const colorFor = resolver("events.collisions")();
    expect(colorFor("near_miss")).toBe("#3b82f6");
    expect(colorFor("hard_brake")).toBe("fallback:hard_brake");
  });

  it("colors the no-value row by field, since it names nothing", () => {
    setScheme({ colorBy: "value", fields: [] });

    expect(resolver("events.collisions")()(null)).toBe(
      "field:events.collisions",
    );
  });

  it("ignores another field's per-value colors", () => {
    setScheme({
      colorBy: "value",
      fields: [
        {
          path: "events.other",
          valueColors: [{ value: "near_miss", color: "#3b82f6" }],
        },
      ],
    });

    expect(resolver("events.collisions")()("near_miss")).toBe(
      "fallback:near_miss",
    );
  });

  // The scheme stores a label field's value colors under the field
  // (`ground_truth`), not under the sidebar row the user filters from
  // (`ground_truth.detections.label`). Resolving under the row instead matched
  // nothing, so every configured color fell through to a hash while the
  // overlays painted the configured one.
  it("resolves a label field's value colors through the field", () => {
    setScheme(
      {
        colorBy: "value",
        fields: [
          {
            path: "ground_truth",
            valueColors: [{ value: "cat", color: "#3b82f6" }],
          },
        ],
      },
      ["ground_truth"],
    );

    const colorFor = resolver("ground_truth.detections.label")();
    expect(colorFor("cat")).toBe("#3b82f6");
    expect(colorFor("dog")).toBe("fallback:dog");
  });

  // The looker keys the value off one attribute per field. A row for any other
  // attribute is not what the overlays color by, so per-value hashes there
  // would disagree with every mark on screen.
  it("gives a row the field is not colored by the field's color", () => {
    setScheme(
      {
        colorBy: "value",
        fields: [
          {
            path: "ground_truth",
            colorByAttribute: "index",
            valueColors: [{ value: "cat", color: "#3b82f6" }],
          },
        ],
      },
      ["ground_truth"],
    );

    expect(resolver("ground_truth.detections.label")()("cat")).toBe(
      "field:ground_truth.detections.label",
    );
  });
});

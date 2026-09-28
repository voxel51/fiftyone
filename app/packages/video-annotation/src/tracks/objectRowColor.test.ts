import { getLabelColorFromContext } from "@fiftyone/lighter";
import type { ColorSchemeInput } from "@fiftyone/relay";
import { COLOR_BY } from "@fiftyone/utilities";
import { beforeAll, describe, expect, it } from "vitest";
import { objectRowColor } from "./objectRowColor";

const colorPool = ["#111111", "#222222", "#333333", "#444444", "#555555"];
const scheme = (over: Partial<ColorSchemeInput> = {}) =>
  ({ colorPool, fields: [], ...over }) as ColorSchemeInput;
const fieldColor = (colorScheme: ColorSchemeInput) =>
  getLabelColorFromContext(
    "frames.seg",
    {},
    { colorScheme: { ...colorScheme, colorBy: COLOR_BY.FIELD }, seed: 0 },
  );

describe("objectRowColor", () => {
  beforeAll(() => {
    // the node environment has no CSS; color validation asks it
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: { supports: (_prop: string, color?: string) => Boolean(color) },
    });
  });

  it.each([COLOR_BY.FIELD, COLOR_BY.VALUE, COLOR_BY.INSTANCE])(
    "gives a mask row its field color when coloring by %s",
    (colorBy) => {
      const colorScheme = scheme({ colorBy });

      expect(objectRowColor(null, "frames.seg", { colorScheme, seed: 0 })).toBe(
        fieldColor(colorScheme),
      );
    },
  );

  it("uses a custom field color for a mask row", () => {
    const colorScheme = scheme({
      colorBy: COLOR_BY.VALUE,
      fields: [{ path: "frames.seg", fieldColor: "#abcdef" }],
    } as Partial<ColorSchemeInput>);

    expect(objectRowColor(null, "frames.seg", { colorScheme, seed: 0 })).toBe(
      "#abcdef",
    );
  });

  it("colors an object row by its label", () => {
    const colorScheme = scheme({ colorBy: COLOR_BY.VALUE });
    const label = { label: "car", index: 1, instance: null };

    expect(objectRowColor(label, "frames.dets", { colorScheme, seed: 0 })).toBe(
      getLabelColorFromContext("frames.dets", label, { colorScheme, seed: 0 }),
    );
  });
});

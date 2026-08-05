// @vitest-environment jsdom
import { getColor } from "@fiftyone/utilities";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { RecoilRoot, useSetRecoilState } from "recoil";
import { describe, expect, it, vi } from "vitest";
import { categoryCss } from "./colors";
import type { ColorMeta, ColorValues } from "./protocol";
import { usePointColors } from "./useColorColumn";
import { useSchemePalette } from "./useSchemePalette";

// @fiftyone/state's barrel needs the app's relay/babel toolchain. These
// stand-ins are the three atoms the hook reads, and colorMap mirrors the
// real selector exactly — the seeded pool generator the grid also colors
// its labels with — so grid parity here is a real assertion, not a stub's
vi.mock("@fiftyone/state", async () => {
  const { atom, selector } = await import("recoil");
  const { createColorGenerator } = await import("@fiftyone/utilities");

  const colorScheme = atom<Scheme>({
    key: "testColorScheme",
    default: {
      colorPool: ["#ee0000", "#00dd00", "#0000cc"],
      fields: [],
      colorscales: [],
      defaultColorscale: null,
    },
  });

  return {
    colorScheme,
    colorMap: selector({
      key: "testColorMap",
      get: ({ get }) => createColorGenerator(get(colorScheme).colorPool, 0),
    }),
    configData: atom({ key: "testConfigData", default: { colorscale: null } }),
  };
});

import * as fos from "@fiftyone/state";

interface Scheme {
  colorPool: string[];
  fields: {
    path: string;
    colorByAttribute?: string;
    valueColors: { value: string; color: string }[];
  }[];
  colorscales: never[];
  defaultColorscale: null;
}

const POOL = ["#ee0000", "#00dd00", "#0000cc"];
const NEXT_POOL = ["#ffaa00", "#aa00ff", "#00aaff"];

const FIELD = "clip.label";
const META: ColorMeta = {
  style: "categorical",
  classes: [
    { label: "person", count: 8202 },
    { label: "cat", count: 6 },
  ],
};
// Identity-stable across renders: a recolor must not depend on a refetch
const COLUMN: ColorValues = {
  style: "categorical",
  indices: new Uint16Array([0, 1]),
};

const scheme = (overrides: Partial<Scheme> = {}): Scheme => ({
  colorPool: POOL,
  fields: [],
  colorscales: [],
  defaultColorscale: null,
  ...overrides,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

const rgbOf = (colors: Float32Array | null, point: number) => [
  colors?.[point * 3],
  colors?.[point * 3 + 1],
  colors?.[point * 3 + 2],
];

const rgbOfHex = (hex: string) =>
  [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);

const renderPlotColors = () =>
  renderHook(
    () => {
      const setColorScheme = useSetRecoilState(fos.colorScheme);
      const palette = useSchemePalette(FIELD, META);
      return {
        palette,
        colors: usePointColors(COLUMN, META, palette),
        setColorScheme,
      };
    },
    { wrapper },
  );

const expectPointColor = (colors: Float32Array | null, hex: string) =>
  rgbOfHex(hex).forEach((channel, c) => {
    expect(rgbOf(colors, 0)[c]).toBeCloseTo(channel, 6);
  });

describe("plot colors follow the App's color scheme", () => {
  it("colors a class with the color the grid paints that label", () => {
    const { result } = renderPlotColors();
    act(() => result.current.setColorScheme(scheme()));

    // getColor is the exact call the grid's overlays make for a label
    // value; the point and its legend swatch must both land on it
    const expected = getColor(POOL, 0, "person");
    expect(result.current.palette.classes[0]).toBe(expected);
    expect(categoryCss(result.current.palette, 0)).toBe(expected);
    expectPointColor(result.current.colors, expected);
  });

  it("recolors the points when the color pool changes", () => {
    // The regression: colors used to be built inside the column fetch,
    // so editing the pool left the plot on its old (hardcoded) palette
    const { result } = renderPlotColors();
    act(() => result.current.setColorScheme(scheme()));
    const before = [...(result.current.colors as Float32Array)];

    act(() => result.current.setColorScheme(scheme({ colorPool: NEXT_POOL })));

    expect([...(result.current.colors as Float32Array)]).not.toEqual(before);
    expectPointColor(result.current.colors, getColor(NEXT_POOL, 0, "person"));
  });

  it("takes a per-value override from the scheme's field settings", () => {
    const { result } = renderPlotColors();
    act(() =>
      result.current.setColorScheme(
        scheme({
          fields: [
            {
              path: "clip",
              valueColors: [{ value: "person", color: "#123456" }],
            },
          ],
        }),
      ),
    );

    expect(result.current.palette.classes[0]).toBe("#123456");
    expectPointColor(result.current.colors, "#123456");
    // The unconfigured class keeps its pool color
    expect(result.current.palette.classes[1]).toBe(getColor(POOL, 0, "cat"));
  });
});

// @vitest-environment jsdom
import { getColor } from "@fiftyone/utilities";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { RecoilRoot } from "recoil";
import { describe, expect, it, vi } from "vitest";
import { categoryCss } from "./colors";
import {
  fetchColor,
  fetchColorByChoices,
  type ColorMeta,
  type ColorResponse,
  type ColorValues,
  type VisualizationRun,
} from "./protocol";
import { useColorColumn } from "./useColorColumn";
import { useColorPalette } from "./useColorPalette";

vi.mock("./protocol", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./protocol")>()),
  fetchColorByChoices: vi.fn(),
  fetchColor: vi.fn(),
}));

// @fiftyone/state's barrel needs the app's relay/babel toolchain. These
// stand-ins are the two atoms the hook reads, and colorMap mirrors the
// real selector exactly — the seeded pool generator the grid also colors
// its labels with — so grid parity here is a real assertion, not a stub's
vi.mock("@fiftyone/state", async () => {
  const { atom, selector, useSetRecoilState } = await import("recoil");
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
    // The app-config colorscale fallback; empty here so tests exercise the
    // scheme-level fallbacks unless a test overrides colorScheme itself
    coloring: selector({
      key: "testColoring",
      get: () => ({ scale: [] }),
    }),
    useSetSessionColorScheme: () => useSetRecoilState(colorScheme),
  };
});

import * as fos from "@fiftyone/state";

interface Scheme {
  colorPool: string[];
  fields: { path: string; valueColors: { value: string; color: string }[] }[];
  colorscales?: { path: string; rgb: readonly (readonly number[])[] }[];
  defaultColorscale?: { rgb: readonly (readonly number[])[] } | null;
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

const wrapper = ({ children }: { children: ReactNode }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

const rgbOfHex = (hex: string) =>
  [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);

const renderPlotColors = () =>
  renderHook(
    () => {
      const setColorScheme = fos.useSetSessionColorScheme();
      return { ...useColorPalette(FIELD, COLUMN, META), setColorScheme };
    },
    { wrapper },
  );

const expectFirstPoint = (colors: Float32Array | null, hex: string) =>
  rgbOfHex(hex).forEach((channel, c) => {
    expect(colors?.[c]).toBeCloseTo(channel, 6);
  });

describe("useColorPalette", () => {
  it("colors a value with the color the grid paints that label", () => {
    const { result } = renderPlotColors();
    act(() => result.current.setColorScheme({ colorPool: POOL, fields: [] }));

    // getColor is the exact call the grid's overlays make for a label
    // value; the point and its legend swatch must both land on it
    const expected = getColor(POOL, 0, "person");
    expect(result.current.palette[0]).toBe(expected);
    expect(categoryCss(result.current.palette, 0)).toBe(expected);
    expectFirstPoint(result.current.colors, expected);
  });

  it("recolors the points when the color pool changes, without a refetch", () => {
    // The regression: colors used to be built inside the column fetch,
    // so editing the pool left the plot on its old (hardcoded) palette
    const { result } = renderPlotColors();
    act(() => result.current.setColorScheme({ colorPool: POOL, fields: [] }));
    const before = [...(result.current.colors as Float32Array)];

    act(() =>
      result.current.setColorScheme({ colorPool: NEXT_POOL, fields: [] }),
    );

    expect([...(result.current.colors as Float32Array)]).not.toEqual(before);
    expectFirstPoint(result.current.colors, getColor(NEXT_POOL, 0, "person"));
  });

  it("takes a per-value override from the scheme's field settings", () => {
    const { result } = renderPlotColors();
    act(() =>
      result.current.setColorScheme({
        colorPool: POOL,
        fields: [
          {
            path: "clip",
            valueColors: [{ value: "person", color: "#123456" }],
          },
        ],
      }),
    );

    expect(result.current.palette[0]).toBe("#123456");
    expectFirstPoint(result.current.colors, "#123456");
    // The unconfigured value keeps its pool color
    expect(result.current.palette[1]).toBe(getColor(POOL, 0, "cat"));
  });

  it("returns null colors before any column has loaded", () => {
    const { result } = renderHook(() => useColorPalette(FIELD, null, META), {
      wrapper,
    });
    expect(result.current.colors).toBeNull();
    // The palette itself doesn't depend on the column, so it's still ready
    expect(result.current.palette).toHaveLength(2);
  });
});

const RUN: VisualizationRun = {
  brainKey: "viz",
  method: null,
  dims: 2,
  patchesField: null,
  pointsField: null,
  model: null,
  ready: true,
  timestamp: null,
};

/** The pair as PlotView composes them: the fetched column, then its palette
 * and built colors — a real (mocked) fetch feeding a real Recoil-driven
 * palette resolution, so a mismatch between what one hook returns and what
 * the other expects fails here even if each hook's own tests pass. */
const useColumnWithColors = (
  datasetName: string | null,
  brainKey: string | null,
  run: VisualizationRun | null,
  colorField: string | null,
) => {
  const column = useColorColumn(datasetName, brainKey, run, colorField);
  const setColorScheme = fos.useSetSessionColorScheme();
  return {
    ...column,
    ...useColorPalette(colorField, column.values, column.meta),
    setColorScheme,
  };
};

describe("useColorColumn + useColorPalette composed (as PlotView uses them)", () => {
  it("colors the fetched column through the App's live scheme", async () => {
    vi.mocked(fetchColorByChoices).mockResolvedValue(["clip.label"]);
    vi.mocked(fetchColor).mockResolvedValue({
      values: { style: "categorical", indices: new Uint16Array([0, 1]) },
      meta: META,
    } satisfies ColorResponse);

    const { result } = renderHook(
      () => useColumnWithColors("ds", "viz", RUN, "clip.label"),
      { wrapper },
    );
    act(() => result.current.setColorScheme({ colorPool: POOL, fields: [] }));

    await waitFor(() => expect(result.current.colors).not.toBeNull());
    expectFirstPoint(result.current.colors, getColor(POOL, 0, "person"));
  });
});

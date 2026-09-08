import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Fo3dSplatSettings } from "../fo3d/splat/settings";
import { useSplatAppearanceControls } from "./use-splat-appearance-controls";

const controls = vi.hoisted(() => ({
  schema: null as unknown,
  setControls: vi.fn(),
  setSplatSettings: vi.fn(),
  settings: {
    detail: "low",
    sharpness: 1,
    sorting: "stable",
    maxSh: 0,
  } as Fo3dSplatSettings,
}));

vi.mock("leva", () => ({
  useControls: (name: string, buildSchema: () => unknown) => {
    controls.schema = { [name]: buildSchema() };
    return [{}, controls.setControls, vi.fn()];
  },
}));

vi.mock("./use-splat-settings", () => ({
  useSplatSettings: () => [controls.settings, controls.setSplatSettings],
}));

type AppearanceSchema = Record<
  string,
  {
    detail: { onChange: (value: "low" | "standard" | "high") => void };
    maxSh: { label: string; onChange: (value: 0 | 1 | 2 | 3) => void };
    opacity: { onChange: (value: number) => void };
    sharpness: { onChange: (value: number) => void };
    sorting: { onChange: (value: "stable" | "accurate") => void };
    splatTypeLabel: unknown;
    tint: { onChange: (value: string) => void };
  }
>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSplatAppearanceControls", () => {
  it("registers rendering controls in the asset folder", () => {
    renderHook(() =>
      useSplatAppearanceControls({
        assetKey: "scene.spz",
        defaultOpacity: 1,
        defaultTint: "#ffffff",
        name: "reconstruction",
      }),
    );

    const schema = controls.schema as AppearanceSchema;
    const assetControls = schema.reconstruction;
    expect(Object.keys(assetControls)).toEqual([
      "splatTypeLabel",
      "opacity",
      "tint",
      "detail",
      "sharpness",
      "sorting",
      "maxSh",
    ]);
    expect(assetControls.maxSh.label).toBe("View-dependent color");
    expect(controls.setControls).toHaveBeenCalledWith({
      detail: "low",
      maxSh: 0,
      sharpness: 1,
      sorting: "stable",
    });

    assetControls.detail.onChange("high");
    assetControls.sharpness.onChange(1.7);
    assetControls.sorting.onChange("accurate");
    assetControls.maxSh.onChange(2);

    const expectedSettings: Fo3dSplatSettings[] = [
      { ...controls.settings, detail: "high" },
      { ...controls.settings, sharpness: 1.7 },
      { ...controls.settings, sorting: "accurate" },
      { ...controls.settings, maxSh: 2 },
    ];
    expect(controls.setSplatSettings).toHaveBeenCalledTimes(
      expectedSettings.length,
    );
    controls.setSplatSettings.mock.calls.forEach(([update], index) => {
      expect(update(controls.settings)).toEqual(expectedSettings[index]);
    });
  });

  it("supports live edits and resets when the asset changes", () => {
    const { result, rerender } = renderHook(
      ({ assetKey, defaultOpacity, defaultTint }) =>
        useSplatAppearanceControls({
          assetKey,
          defaultOpacity,
          defaultTint,
          name: "reconstruction",
        }),
      {
        initialProps: {
          assetKey: "first.spz",
          defaultOpacity: 0.8,
          defaultTint: "#ffffff",
        },
      },
    );

    const schema = controls.schema as AppearanceSchema;
    act(() => {
      schema.reconstruction.opacity.onChange(0.35);
      schema.reconstruction.tint.onChange("#ff0000");
    });
    expect(result.current).toEqual({ opacity: 0.35, tint: "#ff0000" });

    rerender({
      assetKey: "second.spz",
      defaultOpacity: 0.6,
      defaultTint: "#00ff00",
    });

    expect(result.current).toEqual({ opacity: 0.6, tint: "#00ff00" });
    expect(controls.setControls).toHaveBeenLastCalledWith({
      opacity: 0.6,
      tint: "#00ff00",
    });
  });
});

/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GridRail from "./GridRail";
import { gridRailMode } from "./railModes";
import type { GridRailState } from "./useGridRail";

vi.mock("@fiftyone/state", () => ({
  useGridOrderInput: () => ({ sortBy: "camera" }),
}));

afterEach(cleanup);

const state = (mode: GridRailState["mode"]): GridRailState => ({
  follow: () => () => undefined,
  jump: vi.fn(),
  mode,
  position: undefined,
  seekValue: vi.fn(),
  visible: undefined,
});

const base = {
  kind: "order" as const,
  token: "t",
  total: null,
  desc: false,
  ticks: [],
};

describe("GridRail", () => {
  it("shows no rail for a SCROLL order", () => {
    const mode = gridRailMode({ ...base, mode: "SCROLL", bounds: null }, false);
    render(<GridRail rail={state(mode)} />);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows an offset rail for a SMALL order", () => {
    const mode = gridRailMode(
      { ...base, mode: "SMALL", total: 500, bounds: null },
      false,
    );
    render(<GridRail rail={state(mode)} />);
    expect(screen.getByRole("slider").getAttribute("aria-valuetext")).toBe(
      "1 of 500",
    );
  });

  it("jumps a string sort by value, once per Enter", () => {
    const mode = gridRailMode(
      {
        ...base,
        mode: "INDEXED",
        bounds: { min: "cam-a", max: "cam-z", scale: null },
      },
      false,
    );
    const rail = state(mode);
    render(<GridRail rail={rail} />);
    expect(screen.queryByRole("slider")).toBeNull();

    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "cam-m" } });
    expect(rail.seekValue).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(rail.seekValue).toHaveBeenCalledTimes(1);
    expect(rail.seekValue).toHaveBeenCalledWith("cam-m");
  });
});

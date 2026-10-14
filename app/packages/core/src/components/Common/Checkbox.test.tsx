import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import {
  constSelector,
  RecoilRoot,
  selector,
  type RecoilValueReadOnly,
} from "recoil";
import { ThemeProvider } from "styled-components";
import { afterEach, describe, expect, it, vi } from "vitest";
import Checkbox from "./Checkbox";

vi.mock("@fiftyone/components", () => ({
  LoadingDots: () => <span data-testid="loading-dots">...</span>,
  useTheme: () => ({ primary: { plainColor: "#ffffff" } }),
}));
vi.mock("@fiftyone/state", () => ({
  AggregationQueryTimeout: class extends Error {},
}));
vi.mock("./TimedOut", () => ({ default: () => null }));
vi.mock("../Actions/utils", () => ({
  useHighlightHover: () => ({ style: {} }),
}));
vi.mock("../Filters/utils", () => ({
  getValueString: (value: unknown) => [String(value), null],
}));
vi.mock("../utils", () => ({ NameAndCountContainer: "div" }));
vi.mock("../../utils/generic", () => ({ prettify: (value: string) => value }));

const renderCheckbox = (props: {
  count: number | RecoilValueReadOnly<number>;
  subcountAtom?: RecoilValueReadOnly<number>;
}) =>
  render(
    <RecoilRoot>
      <ThemeProvider theme={{ text: { secondary: "#ffffff" } }}>
        <Checkbox name="Stopped vehicle" value={false} {...props} />
      </ThemeProvider>
    </RecoilRoot>,
  );

describe("checkbox counts", () => {
  afterEach(cleanup);

  it.each([0, 35, 1250])(
    "renders a completed count of %i without dots",
    (count) => {
      renderCheckbox({ count });
      expect(screen.getByText(count.toLocaleString())).toBeTruthy();
      expect(screen.queryByTestId("loading-dots")).toBeNull();
    },
  );

  it("renders a resolved count selector without a subcount", () => {
    renderCheckbox({ count: constSelector(35) });
    expect(screen.getByText("35")).toBeTruthy();
    expect(screen.queryByTestId("loading-dots")).toBeNull();
  });

  it("preserves a distinct filtered subcount", () => {
    renderCheckbox({ count: 35, subcountAtom: constSelector(7) });
    expect(screen.getByText("7 of 35")).toBeTruthy();
    expect(screen.queryByTestId("loading-dots")).toBeNull();
  });

  it("shows dots while an explicitly requested subcount is pending", () => {
    const pending = selector<number>({
      key: "test_pending_checkbox_subcount",
      get: () => new Promise<number>(() => {}),
    });
    renderCheckbox({ count: 35, subcountAtom: pending });
    expect(screen.getByText("35")).toBeTruthy();
    expect(screen.getByTestId("loading-dots")).toBeTruthy();
  });
});

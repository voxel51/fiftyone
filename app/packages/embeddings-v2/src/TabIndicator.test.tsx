// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecoilRoot, useRecoilValue } from "recoil";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSelectionNonceState,
  selectionCountState,
  selectionSampleCountState,
} from "./state";
import TabIndicator from "./TabIndicator";

// The real pill lives in (and is tested by) @fiftyone/components, whose
// barrel needs the app's relay/babel toolchain; this test pins our side
// of the contract — the props handed across and the atom protocol
vi.mock("@fiftyone/components", () => ({
  FilterAndSelectionIndicator: ({
    selectionCount,
    onClickSelection,
  }: {
    selectionCount?: string;
    onClickSelection?: () => void;
  }) => (
    <button type="button" onClick={onClickSelection}>
      {selectionCount}
    </button>
  ),
}));

function NonceProbe() {
  const nonce = useRecoilValue(clearSelectionNonceState);
  return <span data-testid="nonce">{nonce}</span>;
}

describe("TabIndicator", () => {
  afterEach(cleanup);

  it("renders nothing without a selection", () => {
    const { container } = render(
      <RecoilRoot>
        <TabIndicator />
      </RecoilRoot>,
    );
    expect(container.textContent).toBe("");
  });

  it("shows the count and requests a clear on click", () => {
    render(
      <RecoilRoot initializeState={({ set }) => set(selectionCountState, 1234)}>
        <TabIndicator />
        <NonceProbe />
      </RecoilRoot>,
    );

    // The pill carries the plot selection's size, formatted
    const pill = screen.getByText((1234).toLocaleString());
    fireEvent.click(pill);

    // Clearing is a request through the nonce — the plot view owns the
    // actual teardown (chart state + Recoil selection atoms)
    expect(screen.getByTestId("nonce").textContent).toBe("1");
  });

  it("prefers the sample count over the point count when published", () => {
    // The pill sits beside the grid, which counts samples; the point
    // count (one sample can own many points) is only the fallback
    render(
      <RecoilRoot
        initializeState={({ set }) => {
          set(selectionCountState, 1234);
          set(selectionSampleCountState, 3);
        }}
      >
        <TabIndicator />
      </RecoilRoot>,
    );

    expect(screen.getByText("3")).toBeDefined();
    expect(screen.queryByText((1234).toLocaleString())).toBeNull();
  });
});

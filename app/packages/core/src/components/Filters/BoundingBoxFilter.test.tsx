import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useSidebarPathCount: vi.fn(),
}));

// Provide just the @fiftyone/state surface the component reads.
vi.mock("@fiftyone/state", () => ({
  useBoundingBoxVisibility: () => true,
  useField: () => ({ name: "bounding_box" }),
  useSidebarPathCount: mocks.useSidebarPathCount,
  useToggleBoundingBoxVisibility: () => () => undefined,
}));

// Stub the header so the test doesn't pull in its dependency tree; this test
// only cares whether the row renders.
vi.mock("../FieldLabelAndInfo", () => ({
  default: () => <div data-testid="bounding-box-row" />,
}));

vi.mock("./use-label-attribute-icon", () => ({
  AttributeEye: () => null,
}));

import BoundingBoxFilter from "./BoundingBoxFilter";

const renderRow = () =>
  render(
    <BoundingBoxFilter
      color="#ffffff"
      labelPath="ground_truth"
      modal={true}
      path="ground_truth.detections.bounding_box"
    />,
  );

describe("BoundingBoxFilter", () => {
  afterEach(() => {
    mocks.useSidebarPathCount.mockReset();
    cleanup();
  });

  it("shows the row when the sample has labels in the field", () => {
    mocks.useSidebarPathCount.mockReturnValue(2);
    renderRow();

    expect(screen.getByTestId("bounding-box-row")).toBeTruthy();
    // the same expanded path the field's count badge uses
    expect(mocks.useSidebarPathCount).toHaveBeenCalledWith({
      path: "ground_truth.detections",
      modal: true,
    });
  });

  it("hides the row when the sample has no labels in the field", () => {
    mocks.useSidebarPathCount.mockReturnValue(0);
    renderRow();

    expect(screen.queryByTestId("bounding-box-row")).toBeNull();
  });
});

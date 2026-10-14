// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Sorting by similarity lives in the Embeddings panel, so the grid actions
// row no longer offers a sort-by-similarity button for any dataset.

const captured: { items: { id: string }[] } = { items: [] };

vi.mock("@fiftyone/components", () => ({
  AdaptiveMenu: (props: { items: { id: string }[] }) => {
    captured.items = props.items;
    return null;
  },
}));

vi.mock("@fiftyone/operators", () => ({
  OperatorPlacementWithErrorBoundary: () => null,
  types: {
    Places: {
      SAMPLES_GRID_ACTIONS: "grid",
      SAMPLES_GRID_SECONDARY_ACTIONS: "grid-secondary",
    },
  },
  useOperatorPlacements: () => ({ placements: [] }),
}));

vi.mock("@fiftyone/state/src/selection", () => ({
  useGridSelectionDataset: () => ({ enabled: true }),
}));

vi.mock("@fiftyone/utilities", () => ({
  // Order persistence is not what these assert; pass the list straight through
  useItemsWithOrderPersistence: (items: { id: string }[]) => ({
    orderedItems: items,
    setOrder: vi.fn(),
  }),
}));

// vi.mock is hoisted above every declaration, so each factory is inline
vi.mock("../../Actions/BrowseOperations", () => ({ default: () => null }));
vi.mock("../../Actions/ColorScheme", () => ({ default: () => null }));
vi.mock("../../Actions/Options", () => ({ default: () => null }));
vi.mock("../../Actions/Selected", () => ({ default: () => null }));
vi.mock("../../Actions/Tag", () => ({ default: () => null }));
vi.mock("../../Actions/ToggleSidebar", () => ({ default: () => null }));
vi.mock("./Patches", () => ({ default: () => null }));
vi.mock("./SaveFilters", () => ({ default: () => null }));

import GridActions from "./index";

const renderIds = () => {
  render(<GridActions />);
  return captured.items.map(({ id }) => id);
};

describe("grid actions row", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.items = [];
  });

  it("renders the row without a sort-by-similarity button", () => {
    expect(renderIds()).toEqual([
      "toggle-sidebar",
      "colors",
      "patches",
      "save-filters",
      "browse-operations",
      "options",
    ]);
  });
});

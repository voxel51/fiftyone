import { AdaptiveMenu } from "@fiftyone/components";
import {
  OperatorPlacementWithErrorBoundary,
  types,
  useOperatorPlacements,
} from "@fiftyone/operators";
import { useItemsWithOrderPersistence } from "@fiftyone/utilities";
import { Box } from "@mui/material";
import React, { useMemo } from "react";
import BrowseOperationsAction from "../../Actions/BrowseOperations";
import ColorSchemeAction from "../../Actions/ColorScheme";
import OptionsAction from "../../Actions/Options";
import SelectedAction from "../../Actions/Selected";
import Similarity from "../../Actions/Similarity";
import TagAction from "../../Actions/Tag";
import ToggleSidebarAction from "../../Actions/ToggleSidebar";
import type { ActionProps } from "../../Actions/types";
import DynamicGroupAction from "./DynamicGroup";
import PatchesAction from "./Patches";
import SaveFiltersAction from "./SaveFilters";

const ToggleSidebar = (props: ActionProps) => (
  <ToggleSidebarAction
    modal={false}
    adaptiveMenuItemProps={props.adaptiveMenuItemProps}
  />
);

const ColorScheme = (props: ActionProps) => (
  <ColorSchemeAction
    modal={false}
    adaptiveMenuItemProps={props.adaptiveMenuItemProps}
  />
);

const Tag = (props: ActionProps) => (
  <TagAction
    modal={false}
    adaptiveMenuItemProps={props.adaptiveMenuItemProps}
  />
);

const Patches = (props: ActionProps) => (
  <PatchesAction adaptiveMenuItemProps={props.adaptiveMenuItemProps} />
);

const SimilarityAction = (props: ActionProps) => (
  <SimilarityAction adaptiveMenuItemProps={props.adaptiveMenuItemProps} />
);

const SaveFilters = (props: ActionProps) => (
  <SaveFiltersAction adaptiveMenuItemProps={props.adaptiveMenuItemProps} />
);

const Selected = (props: ActionProps) => (
  <SelectedAction
    modal={false}
    adaptiveMenuItemProps={props.adaptiveMenuItemProps}
  />
);

const DynamicGroup = (props: ActionProps) => (
  <DynamicGroupAction adaptiveMenuItemProps={props.adaptiveMenuItemProps} />
);

const BrowseOperations = (props: ActionProps) => (
  <BrowseOperationsAction adaptiveMenuItemProps={props.adaptiveMenuItemProps} />
);

const Options = (props: ActionProps) => (
  <OptionsAction
    modal={false}
    adaptiveMenuItemProps={props.adaptiveMenuItemProps}
  />
);

export const GridActionsRow = () => {
  const { placements: primaryPlacements } = useOperatorPlacements(
    types.Places.SAMPLES_GRID_ACTIONS
  );
  const { placements: secondaryPlacements } = useOperatorPlacements(
    types.Places.SAMPLES_GRID_SECONDARY_ACTIONS
  );
  const initialItems = useMemo(() => {
    return [
      {
        id: "toggle-sidebar",
        Component: ToggleSidebar,
        priority: 1, // always show this first
      },
      {
        id: "colors",
        Component: ColorScheme,
      },
      {
        id: "tag",
        Component: Tag,
      },
      {
        id: "patches",
        Component: Patches,
      },
      {
        id: "similarity",
        Component: Similarity,
      },
      {
        id: "save-filters",
        Component: SaveFilters,
      },
      {
        id: "selected",
        Component: Selected,
      },
      {
        id: "dynamic-group-action",
        Component: DynamicGroup,
      },
      {
        id: "browse-operations",
        Component: BrowseOperations,
      },
      {
        id: "options",
        Component: Options,
      },
      ...primaryPlacements.map((placement) => {
        return {
          id: placement?.operator?.uri,
          Component: (props) => {
            return (
              <OperatorPlacementWithErrorBoundary
                place={types.Places.SAMPLES_GRID_ACTIONS}
                adaptiveMenuItemProps={props}
                {...placement}
              />
            );
          },
        };
      }),
      ...secondaryPlacements.map((placement) => {
        return {
          id: placement?.operator?.uri,
          Component: (props) => {
            return (
              <OperatorPlacementWithErrorBoundary
                place={types.Places.SAMPLES_GRID_SECONDARY_ACTIONS}
                adaptiveMenuItemProps={props}
                {...placement}
              />
            );
          },
        };
      }),
    ];
  }, [primaryPlacements, secondaryPlacements]);
  const { orderedItems, setOrder } = useItemsWithOrderPersistence(
    initialItems,
    "grid-actions-row"
  );

  return (
    <Box sx={{ width: "100%", minWidth: 100 }}>
      <AdaptiveMenu
        id="grid-actions-row"
        items={orderedItems}
        onOrderChange={(items) => {
          setOrder(items);
        }}
      />
    </Box>
  );
};

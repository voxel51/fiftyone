import type { AdaptiveMenuItemComponentPropsType } from "@fiftyone/components";
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
import SimilarityAction from "../../Actions/Similarity";
import TagAction from "../../Actions/Tag";
import ToggleSidebarAction from "../../Actions/ToggleSidebar";
import DynamicGroupAction from "./DynamicGroup";
import PatchesAction from "./Patches";
import SaveFiltersAction from "./SaveFilters";

const ToggleSidebar = (props: AdaptiveMenuItemComponentPropsType) => (
  <ToggleSidebarAction modal={false} adaptiveMenuItemProps={props} />
);

const ColorScheme = (props: AdaptiveMenuItemComponentPropsType) => (
  <ColorSchemeAction modal={false} adaptiveMenuItemProps={props} />
);

const Tag = (props: AdaptiveMenuItemComponentPropsType) => (
  <TagAction modal={false} adaptiveMenuItemProps={props} />
);

const Patches = (props: AdaptiveMenuItemComponentPropsType) => (
  <PatchesAction adaptiveMenuItemProps={props} />
);

const Similarity = (props: AdaptiveMenuItemComponentPropsType) => (
  <SimilarityAction modal={false} adaptiveMenuItemProps={props} />
);

const SaveFilters = (props: AdaptiveMenuItemComponentPropsType) => (
  <SaveFiltersAction adaptiveMenuItemProps={props} />
);

const Selected = (props: AdaptiveMenuItemComponentPropsType) => (
  <SelectedAction modal={false} adaptiveMenuItemProps={props} />
);

const DynamicGroup = (props: AdaptiveMenuItemComponentPropsType) => {
  return <DynamicGroupAction adaptiveMenuItemProps={props} />;
};
const BrowseOperations = (props: AdaptiveMenuItemComponentPropsType) => (
  <BrowseOperationsAction adaptiveMenuItemProps={props} />
);

const Options = (props: AdaptiveMenuItemComponentPropsType) => (
  <OptionsAction modal={false} adaptiveMenuItemProps={props} />
);

export default () => {
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

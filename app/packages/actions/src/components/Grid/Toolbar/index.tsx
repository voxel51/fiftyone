import {
  OperatorPlacementWithErrorBoundary,
  types,
  useOperatorBrowser,
  useOperatorPlacements,
} from "@fiftyone/operators";
import { PackageIcon } from "@voxel51/voodo";
import styled from "styled-components";
import FiltersToggle from "./FiltersToggle";
import GroupsMenu from "./GroupsMenu";
import PatchesMenu from "./PatchesMenu";
import ToolbarAction from "./ToolbarAction";

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
`;

const Divider = styled.div`
  width: 1px;
  height: 16px;
  margin-right: 4px;
  flex-shrink: 0;
  background: color-mix(
    in srgb,
    var(--color-content-border-default) 30%,
    transparent
  );
`;

const Placements = ({ place }: { place: types.Places }) => {
  const { placements } = useOperatorPlacements(place);

  return (
    <>
      {placements.map((placement) => (
        <OperatorPlacementWithErrorBoundary
          key={placement?.operator?.uri}
          place={place}
          {...placement}
        />
      ))}
    </>
  );
};

const More = () => {
  const browser = useOperatorBrowser();

  return (
    <ToolbarAction
      active={browser.isVisible}
      data-cy="action-browse-operations"
      icon={PackageIcon}
      label="More"
      title="Browse operations"
      onClick={() => browser.toggle()}
    />
  );
};

/** The grid toolbar's left side: filters, views, plugin actions */
const GridToolbar = () => (
  <Row>
    <FiltersToggle />
    <Divider />
    <GroupsMenu />
    <PatchesMenu />
    <Placements place={types.Places.SAMPLES_GRID_ACTIONS} />
    <Placements place={types.Places.SAMPLES_GRID_SECONDARY_ACTIONS} />
    <More />
  </Row>
);

export default GridToolbar;

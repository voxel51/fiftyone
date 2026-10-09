import { FilterAndSelectionIndicator } from "@fiftyone/components";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { BUILT_IN_PANEL_PRIORITY_CONST } from "@fiftyone/utilities";
import {
  useReverbValue,
  useReverbValueLoadable,
  useResetReverbState,
} from "@fiftyone/reverb";
import {
  BackgroundColor,
  GridViewIcon,
  Pill,
  Size,
  TextColor,
} from "@voxel51/voodo";
import styled from "styled-components";
import Grid from "../components/Grid";
import { FieldActionContext, GridSidebar } from "@fiftyone/sidebar";
import { QuickEditEntry } from "../components/Modal/Sidebar/Annotate";
import SchemaLensRow from "../components/SchemaLens/SchemaLensRow";

const Container = styled.div`
  display: flex;
  height: 100%;
  overflow: hidden;
`;

const GridArea = styled.div`
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
`;

// The grid's actions row (Grid/Header) is hidden while the sample view's
// layout settles; it returns as the panel's toolbar
const SamplesPanel = () => {
  const showSidebar = useReverbValue(fos.sidebarVisible(false));

  return (
    <Container>
      {showSidebar && (
        <FieldActionContext.Provider value={QuickEditEntry}>
          <GridSidebar header={<SchemaLensRow padded={false} />} />
        </FieldActionContext.Provider>
      )}
      <GridArea>
        <Grid key={"grid"} />
      </GridArea>
    </Container>
  );
};

registerComponent({
  name: "Samples",
  label: "Samples",
  component: SamplesPanel,
  type: PluginComponentType.Panel,
  Icon: GridViewIcon,
  activator: () => true,
  panelOptions: { TabIndicator, priority: BUILT_IN_PANEL_PRIORITY_CONST },
});

function TabIndicator() {
  const similarityParameters = useReverbValue(fos.similarityParameters);
  const resetSimilarityParameters = useResetReverbState(
    fos.similarityParameters,
  );
  const selectedSamples = useReverbValue(fos.selectedSamples);
  const resetSelectedSamples = useResetReverbState(fos.selectedSamples);

  const selectedSamplesCount = selectedSamples.size;

  return (
    <>
      <SampleCount />
      <FilterAndSelectionIndicator
        filterCount={similarityParameters ? "" : undefined}
        filterTitle="Reset sort by similarity"
        onClickFilter={resetSimilarityParameters}
        selectionCount={
          selectedSamplesCount > 0 ? selectedSamplesCount.toString() : undefined
        }
        onClickSelection={resetSelectedSamples}
      />
    </>
  );
}

/** What the grid shows, once it is counted. */
function SampleCount() {
  const count = useReverbValueLoadable(
    fos.count({ path: "", extended: true, modal: false }),
  );
  if (count.state !== "hasValue") return null;

  return (
    <Pill
      size={Size.Xs}
      backgroundColor={BackgroundColor.CardElevated}
      color={TextColor.Secondary}
      data-cy="samples-tab-count"
    >
      {(count.contents as number).toLocaleString()}
    </Pill>
  );
}

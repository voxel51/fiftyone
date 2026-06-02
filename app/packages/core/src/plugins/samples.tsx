import { FilterAndSelectionIndicator } from "@fiftyone/components";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { BUILT_IN_PANEL_PRIORITY_CONST } from "@fiftyone/utilities";
import AppsIcon from "@mui/icons-material/Apps";
import { useRecoilValue, useResetRecoilState } from "recoil";
import styled from "styled-components";
import Grid from "../components/Grid";
import Header from "../components/Grid/Header";
import Swimlanes from "../components/Grid/Swimlanes";

const Container = styled.div`
  position: relative;
  padding: 0;
  height: 100%;
  overflow-y: hidden;
`;

const SamplesView = () => {
  // Swap between the single-grid and per-slice-lane views. Toggle is
  // gated on `gridSwimlanesAvailable` (group datasets only), so on
  // non-group datasets `enabled` resolves to its default but the
  // availability check ensures we never render lanes without slices.
  const [enabled] = fos.useGridSwimlanes();
  const available = fos.useGridSwimlanesAvailable();
  const showLanes = enabled && available;
  return (
    <Container>
      {showLanes ? <Swimlanes key="swimlanes" /> : <Grid key="grid" />}
      <Header key="header" />
    </Container>
  );
};

registerComponent({
  name: "Samples",
  label: "Samples",
  component: SamplesView,
  type: PluginComponentType.Panel,
  Icon: AppsIcon,
  activator: () => true,
  panelOptions: { TabIndicator, priority: BUILT_IN_PANEL_PRIORITY_CONST },
});

function TabIndicator() {
  const similarityParameters = useRecoilValue(fos.similarityParameters);
  const resetSimilarityParameters = useResetRecoilState(
    fos.similarityParameters
  );
  const selectedSamples = useRecoilValue(fos.selectedSamples);
  const resetSelectedSamples = useResetRecoilState(fos.selectedSamples);

  const selectedSamplesCount = selectedSamples.size;

  return (
    <FilterAndSelectionIndicator
      filterCount={similarityParameters ? "" : undefined}
      filterTitle="Reset sort by similarity"
      onClickFilter={resetSimilarityParameters}
      selectionCount={
        selectedSamplesCount > 0 ? selectedSamplesCount.toString() : undefined
      }
      onClickSelection={resetSelectedSamples}
    />
  );
}

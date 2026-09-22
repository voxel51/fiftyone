import { FilterAndSelectionIndicator } from "@fiftyone/components";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { BUILT_IN_PANEL_PRIORITY_CONST } from "@fiftyone/utilities";
import AppsIcon from "@mui/icons-material/Apps";
import { useReverbValue, useResetReverbState } from "@fiftyone/reverb";
import styled from "styled-components";
import Grid from "../components/Grid";
import Header from "../components/Grid/Header";

const Container = styled.div`
  position: relative;
  padding: 0;
  height: 100%;
  overflow-y: hidden;
`;

registerComponent({
  name: "Samples",
  label: "Samples",
  component: () => {
    return (
      <Container>
        <Grid key={"grid"} />
        <Header key={"header"} />
      </Container>
    );
  },
  type: PluginComponentType.Panel,
  Icon: AppsIcon,
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

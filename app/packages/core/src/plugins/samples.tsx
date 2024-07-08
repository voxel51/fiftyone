import { FilterAndSelectionIndicator } from "@fiftyone/components";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import AppsIcon from "@mui/icons-material/Apps";
import { useRecoilValue, useResetRecoilState } from "recoil";
import styled from "styled-components";
import Grid from "../components/Grid/Grid";
import ContainerHeader from "../components/ImageContainerHeader";

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
        <ContainerHeader key={"header"} />
      </Container>
    );
  },
  type: PluginComponentType.Panel,
  Icon: AppsIcon,
  activator: () => true,
  panelOptions: { TabIndicator },
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

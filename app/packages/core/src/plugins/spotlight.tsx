import { FilterAndSelectionIndicator } from "@fiftyone/components";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import AppsIcon from "@mui/icons-material/Apps";
import React from "react";
import { useRecoilValue, useResetRecoilState } from "recoil";
import styled from "styled-components";
import Grid from "../components/Grid/SpotlightGrid";
import ContainerHeader from "../components/ImageContainerHeader";

const Container = styled.div`
  position: relative;
  padding: 0 0 0 1rem;
  height: 100%;
`;

registerComponent({
  name: "Spotlight",
  label: "Spotlight",
  component: () => (
    <Container>
      <Grid key={"grid"} />
      <ContainerHeader key={"header"} />
    </Container>
  ),
  type: PluginComponentType.Panel,
  Icon: AppsIcon,
  activator: () => {
    return true;
  },
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

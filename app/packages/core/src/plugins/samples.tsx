import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import AppsIcon from "@mui/icons-material/Apps";
import React, { Suspense } from "react";
import { useRecoilValue, useResetRecoilState } from "recoil";
import styled from "styled-components";
import Grid from "../components/Grid";
import ContainerHeader from "../components/ImageContainerHeader";
import * as fos from "@fiftyone/state";
import { FilterAndSelectionIndicator } from "@fiftyone/components";
import { EmptySamples } from "../components";

const FlashlightContainer = styled.div`
  position: relative;
  padding: 0 0 0 1rem;
  height: 100%;
`;

registerComponent({
  name: "Samples",
  label: "Samples",
  component: () => (
    <FlashlightContainer>
      <Grid key={"grid"} />
      <ContainerHeader key={"header"} />
    </FlashlightContainer>
  ),
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

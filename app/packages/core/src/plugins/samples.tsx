import React from "react";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import AppsIcon from "@mui/icons-material/Apps";
import styled from "styled-components";
import Grid from "../components/Grid";
import ContainerHeader from "../components/ImageContainerHeader";

const FlashlightContainer = styled.div`
  position: relative;
  // todo: compute dynamically
  height: calc(100vh - 112px);
  padding: 0 0 0 1rem;
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
  panelOptions: {
    allowDuplicates: false,
  },
});

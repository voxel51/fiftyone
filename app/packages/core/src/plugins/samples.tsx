import React from "react";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import AppsIcon from "@mui/icons-material/Apps";
import styled from "styled-components";
import Grid from "../components/Grid";
import ContainerHeader from "../components/ImageContainerHeader";

const FlashlightContainer = styled.div`
  position: relative;
  // todo: compute dynamically
  height: 75vh;
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
  type: PluginComponentType.Plot,
  Icon: AppsIcon,
  activator: () => true,
});

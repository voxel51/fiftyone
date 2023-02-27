import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import AppsIcon from "@mui/icons-material/Apps";
import React from "react";
import styled from "styled-components";
import Grid from "../components/Grid";
import ContainerHeader from "../components/ImageContainerHeader";

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
});

import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { BarChart } from "@mui/icons-material";
import React from "react";
import styled from "styled-components";
import Distributions from "../components/Distributions";
import { scrollbarStyles } from "../components/utils";

const DistributionsContainer = styled.div`
  ${scrollbarStyles}
`;

const plots = ["Sample tags", "Label tags", "Labels", "Other fields"];

function Plots() {
  return (
    <DistributionsContainer style={{ height: "75vh", overflow: "auto" }}>
      {plots.map((plot) => (
        <Distributions
          key={plot}
          group={plot}
          style={{ overflow: "auto", height: "auto" }}
        />
      ))}
    </DistributionsContainer>
  );
}

registerComponent({
  name: "Histograms",
  label: "Histograms",
  component: Plots,
  type: PluginComponentType.Plot,
  activator: () => true,
  Icon: BarChart,
});

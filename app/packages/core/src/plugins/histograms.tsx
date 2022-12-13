import { Selector } from "@fiftyone/components";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { usePanelState, usePanelTitle } from "@fiftyone/spaces";
import { BarChart } from "@mui/icons-material";
import React, { useEffect } from "react";
import styled from "styled-components";
import Distributions from "../components/Distributions";
import { scrollbarStyles } from "../components/utils";

const DistributionsContainer = styled.div`
  height: 100%;
  ${scrollbarStyles}
`;

const plots = ["Sample tags", "Label tags", "Labels", "Other fields"];

function Plots() {
  const [state, setState] = usePanelState();
  const [_, setTitle] = usePanelTitle();
  const { plot = plots[0] } = state;

  useEffect(() => {
    setTitle(`Histograms - ${plot}`);
  }, [plot]);

  return (
    <DistributionsContainer>
      <Selector
        component={({ value }) => <>{value}</>}
        containerStyle={{
          position: "relative",
          width: "12rem",
          margin: "1rem 1rem 0 1rem",
        }}
        inputStyle={{
          width: "12rem",
        }}
        onSelect={(plot) => {
          setState({ ...state, plot });
        }}
        overflow={true}
        placeholder={"Select histogram"}
        useSearch={(search) => {
          const values = plots.filter((name) => name.includes(search));
          return { values, total: plots.length };
        }}
        value={plot}
      />
      <Distributions key={plot} group={plot} style={{ padding: "1rem" }} />
    </DistributionsContainer>
  );
}

registerComponent({
  name: "Histograms",
  label: "Histograms",
  component: Plots,
  type: PluginComponentType.Panel,
  activator: () => true,
  Icon: BarChart,
});

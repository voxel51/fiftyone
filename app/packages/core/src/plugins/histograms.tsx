import { Selector } from "@fiftyone/components";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { usePanelStatePartial, usePanelTitle } from "@fiftyone/spaces";
import { BarChart } from "@mui/icons-material";
import React, { useEffect } from "react";
import styled from "styled-components";
import Distributions from "../components/Distributions";
import { scrollbarStyles } from "@fiftyone/utilities";
import { OperatorPlacements, types } from "@fiftyone/operators";

const DistributionsContainer = styled.div`
  height: 100%;
  overflow: hidden;
  ${scrollbarStyles}
`;

const ControlsContainer = styled.div`
  display: flex;
  gap: 1rem;
  padding-left: 1rem;
  padding-top: 1rem;
`;

const plots = ["Sample tags", "Label tags", "Labels", "Other fields"];

function Plots() {
  const [_, setTitle] = usePanelTitle();
  const [plot, setPlot] = usePanelStatePartial("plot", plots[0]);

  useEffect(() => {
    setTitle(plot);
  }, [plot]);

  return (
    <DistributionsContainer data-cy="distribution-container">
      <ControlsContainer>
        <Selector
          component={({ value }) => <>{value}</>}
          containerStyle={{ position: "relative", width: "12rem" }}
          inputStyle={{
            width: "12rem",
          }}
          onSelect={(plot) => {
            setPlot(plot);
          }}
          overflow={true}
          placeholder={"Select histogram"}
          useSearch={(search) => {
            const values = plots.filter((name) => name.includes(search));
            return { values, total: plots.length };
          }}
          value={plot}
        />
        <OperatorPlacements place={types.Places.HISTOGRAM_ACTIONS} />
      </ControlsContainer>
      <Distributions key={plot} group={plot} style={{ margin: "1rem" }} />
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

import { Loading, Selector } from "@fiftyone/components";
import { OperatorPlacements, types } from "@fiftyone/operators";
import {
  Categories,
  PluginComponentType,
  registerComponent,
} from "@fiftyone/plugins";
import { usePanelTitle } from "@fiftyone/spaces";
import { datasetName, distributionPaths, field } from "@fiftyone/state";
import { BarChart } from "@mui/icons-material";
import React, { useEffect } from "react";
import {
  DefaultValue,
  atomFamily,
  selector,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import styled from "styled-components";
import Histogram from "../components/Histogram";
import { BUILT_IN_PANEL_PRIORITY_CONST } from "@fiftyone/utilities";

const HistogramsContainer = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  max-height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
`;

const ControlsContainer = styled.div`
  display: flex;
  gap: 1rem;
  margin: 1rem;
`;

const plotPaths = atomFamily<string | null, string>({
  key: "plotPaths",
  default: null,
});

const plotPath = selector<string>({
  key: "plotPath",
  get: ({ get }) => {
    const plotPath = plotPaths(get(datasetName));
    const path = get(plotPath);

    if (!path || !get(field(path))) return get(distributionPaths)[0];

    return path;
  },
  set: ({ get, set }, newValue) => {
    set(
      plotPaths(get(datasetName)),
      newValue instanceof DefaultValue ? null : newValue
    );
  },
});

const PlotSelector = () => {
  const paths = useRecoilValue(distributionPaths);
  const [path, setPath] = useRecoilState(plotPath);
  return (
    <Selector
      component={({ value }) => <>{value}</>}
      containerStyle={{ position: "relative" }}
      onSelect={setPath}
      overflow={true}
      resultsPlacement="bottom-start"
      placeholder={"Select field"}
      useSearch={(search) => {
        const values = paths.filter((name) => name.includes(search));
        return { values, total: paths.length };
      }}
      value={path || ""}
      cy={"histograms"}
    />
  );
};

function Plots() {
  const [_, setTitle] = usePanelTitle();
  const path = useRecoilValue(plotPath);
  useEffect(() => {
    setTitle(path);
  }, [path]);

  return (
    <HistogramsContainer data-cy="histograms-container">
      <ControlsContainer>
        <PlotSelector />
        <OperatorPlacements place={types.Places.HISTOGRAM_ACTIONS} />
      </ControlsContainer>
      {path ? (
        <Histogram key={path} path={path} />
      ) : (
        <Loading>Select a field</Loading>
      )}
    </HistogramsContainer>
  );
}

registerComponent({
  name: "Histograms",
  label: "Histograms",
  component: Plots,
  type: PluginComponentType.Panel,
  activator: () => true,
  Icon: BarChart,
  panelOptions: {
    priority: BUILT_IN_PANEL_PRIORITY_CONST,
    category: Categories.Analyze,
  },
});

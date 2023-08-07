import { Loading, Selector } from "@fiftyone/components";
import { OperatorPlacements, types } from "@fiftyone/operators";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { usePanelTitle } from "@fiftyone/spaces";
import { datasetName, distributionPaths, field } from "@fiftyone/state";
import { scrollbarStyles } from "@fiftyone/utilities";
import { BarChart } from "@mui/icons-material";
import { useEffect } from "react";
import {
  DefaultValue,
  atomFamily,
  selector,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import styled from "styled-components";
import Distribution from "../components/Distribution";

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

const plotPaths = atomFamily<string | null, string>({
  key: "plotPaths",
  default: null,
});

const plotPath = selector<string | null>({
  key: "plotPath",
  get: ({ get }) => {
    const plotPath = plotPaths(get(datasetName));

    const path = get(plotPath);

    if (!path || (path !== "_label_tags" && !get(field(path))))
      return get(distributionPaths)[0] || null;

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
      value={path}
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
    <DistributionsContainer data-cy="distribution-container">
      <ControlsContainer>
        <PlotSelector />
        <OperatorPlacements place={types.Places.HISTOGRAM_ACTIONS} />
      </ControlsContainer>
      {path ? (
        <Distribution key={path} path={path} style={{ margin: "1rem" }} />
      ) : (
        <Loading>Select a field</Loading>
      )}
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

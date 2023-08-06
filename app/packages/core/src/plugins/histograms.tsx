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

const plotGroupValues = ["Sample tags", "Label tags", "Labels", "Other fields"];

const plotGroups = atomFamily<string, string>({
  key: "plotGroups",
  default: "Sample tags",
});

const plotGroup = selector<string>({
  key: "plotGroup",
  get: ({ get }) => get(plotGroups(get(datasetName))),
  set: ({ get, set }, newValue) => {
    set(
      plotGroups(get(datasetName)),
      newValue instanceof DefaultValue ? null : newValue
    );
  },
});

const plotPaths = atomFamily<string | null, { dataset: string; group: string }>(
  {
    key: "plotPaths",
    default: null,
  }
);

const plotPath = selector<string | null>({
  key: "plotPath",
  get: ({ get }) => {
    const group = get(plotGroup);
    if ("Sample tags" === group) {
      return "tags";
    }

    const plotPath = plotPaths({ dataset: get(datasetName), group });

    const path = get(plotPath);

    if (!path || (path !== "_label_tags" && !get(field(path))))
      return get(distributionPaths(group))[0] || null;

    return path;
  },
  set: ({ get, set }, newValue) => {
    set(
      plotPaths({ dataset: get(datasetName), group: get(plotGroup) }),
      newValue instanceof DefaultValue ? null : newValue
    );
  },
});

const PlotSelector = ({ group }: { group: string }) => {
  const paths = useRecoilValue(distributionPaths(group));
  const [path, setPath] = useRecoilState(plotPath);
  return (
    <Selector
      component={({ value }) => <>{value}</>}
      containerStyle={{ position: "relative", width: "12rem" }}
      inputStyle={{
        width: "12rem",
      }}
      onSelect={setPath}
      overflow={true}
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
  const [group, setGroup] = useRecoilState(plotGroup);

  useEffect(() => {
    setTitle(group);
  }, [group]);

  return (
    <DistributionsContainer data-cy="distribution-container">
      <ControlsContainer>
        <Selector<string>
          component={({ value }) => <>{value}</>}
          containerStyle={{ position: "relative", width: "12rem" }}
          inputStyle={{
            width: "12rem",
          }}
          onSelect={setGroup}
          overflow={true}
          placeholder={"Select histogram"}
          useSearch={(search) => {
            const values = plotGroupValues.filter((name) =>
              name.includes(search)
            );
            return { values, total: plotGroups.length };
          }}
          value={group}
        />
        {"Sample tags" !== group && <PlotSelector group={group} />}

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

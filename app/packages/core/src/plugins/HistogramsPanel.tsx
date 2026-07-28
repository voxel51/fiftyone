import { Loading, Selector } from "@fiftyone/components";
import { OperatorPlacements, types } from "@fiftyone/operators";
import { usePanelStatePartial, usePanelTitle } from "@fiftyone/spaces";
import { distributionPaths } from "@fiftyone/state";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import Histogram from "../components/Histogram";

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

function usePlotPath() {
  const paths = useRecoilValue(distributionPaths);
  const [path, setPath] = usePanelStatePartial("path", paths[0]);

  useEffect(() => {
    if (!paths.includes(path)) {
      setPath(paths[0]);
    }
  }, [path, paths, setPath]);

  return { path, setPath, paths };
}

const PlotSelector = () => {
  const { path, setPath, paths } = usePlotPath();

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

export default function Plots() {
  const [_, setTitle] = usePanelTitle();
  const { path } = usePlotPath();

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

import { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import Plot from "react-plotly.js";
import { Loading, Selector } from "@fiftyone/components";
import styled from "styled-components";

const Value: React.FC<{ value: string; className: string }> = ({ value }) => {
  return <>{value}</>;
};

// a react hook that fetches a list of brain results
// and has a loading state and an error state
function useBrainResultsSelector() {
  const [selected, setSelected] = useState(null);
  const dataset = useRecoilValue(fos.dataset);
  const handlers = {
    onSelect(selected) {
      setSelected(selected);
    },
    value: selected,
    toKey: (item) => item.key,
    useSearch: (search) => ({
      values: dataset.brainMethods
        .filter((item) => item.key.toLowerCase().includes(search.toLowerCase()))
        .map((item) => item.key),
    }),
  };

  return {
    handlers,
    brainKey: selected,
    canSelect: dataset?.brainMethods?.length > 0,
    hasSelection: selected !== null,
  };
}

// a react hook that allows for selecting a label
// based on the available labels in the given sample
function useLabelSelector() {
  const dataset = useRecoilValue(fos.dataset);
  const labels = useRecoilValue(fos.labelPaths({ expanded: false }));
  const [label, setLabel] = useState(null);

  const handlers = {
    onSelect(selected) {
      setLabel(selected);
    },
    value: label,
    toKey: (item) => item.key,
    useSearch: (search) => ({
      values: labels.filter((item) =>
        item.toLowerCase().includes(search.toLowerCase())
      ),
    }),
  };

  return {
    label,
    handlers,
    canSelect: labels.length > 0,
    hasSelection: label !== null,
  };
}

const EmbeddingsContainer = styled.div`
  margin: 0 2rem;
`;

const Selectors = styled.div`
  width: 10rem;
  display: flex;
  gap: 1rem;
`;

export default function Embeddings() {
  const brainResultSelector = useBrainResultsSelector();
  const labelSelector = useLabelSelector();
  console.log({ brainResultSelector, labelSelector });
  const canSelect = brainResultSelector.canSelect && labelSelector.canSelect;
  const showPlot =
    brainResultSelector.hasSelection && labelSelector.hasSelection;

  if (canSelect)
    return (
      <EmbeddingsContainer>
        <Selectors>
          <Selector
            {...brainResultSelector.handlers}
            placeholder={"Choose Brain Result"}
            overflow={true}
            component={Value}
          />
          {brainResultSelector.hasSelection && (
            <Selector
              {...labelSelector.handlers}
              placeholder={"Choose Label"}
              overflow={true}
              component={Value}
            />
          )}
        </Selectors>
        {showPlot && (
          <EmbeddingsPlot
            brainKey={brainResultSelector.brainKey}
            labelField={labelSelector.label}
          />
        )}
      </EmbeddingsContainer>
    );

  return <Loading>No Brain Results Available</Loading>;
}

function EmbeddingsPlot({ brainKey, labelField }) {
  const getColor = useRecoilValue(fos.colorMap(true));
  const { results, isLoading, datasetName, handleSelected } = useEmbeddings(
    brainKey,
    labelField
  );
  if (isLoading) return <h3>Pixelating...</h3>;

  return (
    <div>
      <h1>Found {results.length} embeddings!</h1>
      <Plot
        data={[
          {
            x: results.map((d) => d[1][0]),
            y: results.map((d) => d[1][1]),
            type: "scattergl",
            mode: "markers",
            marker: {
              color: results.map((d) => {
                return getColor(d[2]);
              }),
            },
          },
        ]}
        onSelected={(selected) => {
          const selectedResults = selected.points.map(
            (p) => results[p.pointIndex]
          );
          handleSelected(selectedResults);
        }}
        layout={{
          width: 1500,
          height: 1000,
          title: `${datasetName} "${brainKey}" Embeddings`,
          hovermode: false,
          xaxis: {
            showgrid: false,
            zeroline: false,
            visible: false,
          },
          yaxis: {
            showgrid: false,
            zeroline: false,
            visible: false,
          },
        }}
      />
    </div>
  );
}

function useEmbeddings(brainKey, labelField) {
  const datasetName = useRecoilValue(fos.datasetName);
  const [extendedSelection, setExtendedSelection] = useRecoilState(
    fos.extendedSelection
  );
  const [state, setState] = useState({ isLoading: true });
  function onLoaded(results) {
    setState({ results, isLoading: false });
  }
  useEffect(() => {
    fetchEmbeddings(datasetName, brainKey, `${labelField}.label`).then(
      onLoaded
    );
  }, [datasetName, brainKey, labelField]);

  function handleSelected(selectedResults) {
    if (selectedResults.length === 0) return;
    console.log(selectedResults.map((d) => d[0]));
    setExtendedSelection(selectedResults.map((d) => d[0]));
  }

  return { ...state, datasetName, brainKey, handleSelected };
}

async function fetchEmbeddings(dataset, brainKey, labelsField) {
  const res = await getFetchFunction()(
    "GET",
    `/embeddings?dataset=${dataset}&brain_key=${brainKey}&labels_field=${labelsField}`
  );
  return res.results;
}

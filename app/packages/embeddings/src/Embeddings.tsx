import { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import Plot from "react-plotly.js";

export default function Embeddings() {
  const getColor = useRecoilValue(fos.colorMap(true));
  const { results, isLoading, datasetName, brainKey, handleSelected } =
    useEmbeddings();
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

function useEmbeddings() {
  const [brainKey, setBrainKey] = useState("mnist_test"); // TODO remove hardcoded
  const [labelField, setLabelField] = useState("ground_truth.label"); // TODO remove hardcoded
  const datasetName = useRecoilValue(fos.datasetName);
  const [extendedSelection, setExtendedSelection] = useRecoilState(
    fos.extendedSelection
  );
  const [state, setState] = useState({ isLoading: true });
  function onLoaded(results) {
    setState({ results, isLoading: false });
  }
  useEffect(() => {
    fetchEmbeddings(datasetName, brainKey, labelField).then(onLoaded);
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

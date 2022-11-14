import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useRecoilState, useRecoilValue, useRecoilCallback } from "recoil";
import * as fos from "@fiftyone/state";
import { getColor, getFetchFunction } from "@fiftyone/utilities";
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
  height: 100%;
`;

const Selectors = styled.div`
  width: 10rem;
  display: flex;
  gap: 1rem;
`;

export default function Embeddings({ containerHeight }) {
  const el = useRef();
  const brainResultSelector = useBrainResultsSelector();
  const labelSelector = useLabelSelector();
  const canSelect = brainResultSelector.canSelect && labelSelector.canSelect;
  const showPlot =
    brainResultSelector.hasSelection && labelSelector.hasSelection;

  if (canSelect)
    return (
      <EmbeddingsContainer ref={el}>
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
            el={el}
            brainKey={brainResultSelector.brainKey}
            labelField={labelSelector.label}
            containerHeight={containerHeight}
          />
        )}
      </EmbeddingsContainer>
    );

  return <Loading>No Brain Results Available</Loading>;
}

function tracesToData(traces, getColor) {
  return Object.entries(traces).map(([key, trace]) => {
    return {
      x: trace.map((d) => d.points[0]),
      y: trace.map((d) => d.points[1]),
      type: "scattergl",
      mode: "markers",
      marker: {
        color: getColor(key),
      },
      name: key,
    };
  });
}

function EmbeddingsPlot({ brainKey, labelField, el, containerHeight }) {
  const getColor = useRecoilValue(fos.colorMap(true));
  const [bounds, setBounds] = useState({});

  useLayoutEffect(() => {
    if (el.current) {
      setBounds(el.current.getBoundingClientRect());
    }
  }, [el.current]);
  const { traces, isLoading, datasetName, handleSelected } = useEmbeddings(
    brainKey,
    labelField
  );
  if (isLoading) return <h3>Pixelating...</h3>;
  const data = tracesToData(traces, getColor);

  return (
    <div>
      {bounds && (
        <Plot
          data={data}
          onSelected={(selected) => {
            const selectedResults = selected.points.map(
              (p) => results[p.pointIndex]
            );
            handleSelected(selectedResults);
          }}
          config={{ scrollZoom: true, displaylogo: false, responsive: true }}
          layout={{
            showlegend: true,
            width: bounds ? bounds.width : 800,
            height: containerHeight,
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
              scaleanchor: "x",
              scaleratio: 1,
            },
            autosize: true,
            margins: {
              t: 0,
              l: 0,
              b: 0,
              r: 0,
              pad: 0,
            },
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
          }}
        />
      )}
    </div>
  );
}

function useEmbeddings(brainKey, labelField) {
  const view = useRecoilValue(fos.view);
  const filters = useRecoilValue(fos.filters);
  const extended = useRecoilValue(fos.extendedStagesUnsorted);
  const datasetName = useRecoilValue(fos.datasetName);
  const [extendedSelection, setExtendedSelection] = useRecoilState(
    fos.extendedSelection
  );
  const [state, setState] = useState({ isLoading: true });
  function onLoaded(traces) {
    setState({ traces, isLoading: false });
  }
  useEffect(() => {
    setState({ isLoading: true });
    fetchEmbeddings({
      dataset: datasetName,
      brainKey,
      labelsField: `${labelField}.label`,
      view,
      filters,
      extended,
    }).then(onLoaded);
  }, [datasetName, brainKey, labelField, view, filters, extended]);

  function handleSelected(selectedResults) {
    if (selectedResults.length === 0) return;
    console.log(selectedResults.map((d) => d[0]));
    setExtendedSelection(selectedResults.map((d) => d[0]));
  }

  return { ...state, datasetName, brainKey, handleSelected };
}

const fetchEmbeddings = async ({
  dataset,
  brainKey,
  labelsField,
  view,
  filters,
  extended,
}) => {
  const res = await getFetchFunction()("POST", "/embeddings", {
    brainKey,
    labelsField,
    filters,
    dataset,
    view,
    extended,
  });
  return res.traces;
};

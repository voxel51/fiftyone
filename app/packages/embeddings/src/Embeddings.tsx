import { useEffect, useState, useRef, useLayoutEffect } from "react";
import {
  useRecoilState,
  useRecoilValue,
  useRecoilCallback,
  atom,
} from "recoil";
import * as fos from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import Plot from "react-plotly.js";
import { Button, Loading, Selector } from "@fiftyone/components";
import styled from "styled-components";
import { useToPatches } from "@fiftyone/state";
// import { usePanelState } from "@fiftyone/spaces";

const placeholderPanelStateAtom = atom({
  key: "placeholderPanelStateAtom",
  default: {},
});

function usePanelState_PLACEHOLDER() {
  const [state, setState] = useRecoilState(placeholderPanelStateAtom);
  return [state, setState];
}

const usePanelState = usePanelState_PLACEHOLDER;

function usePanelField(field, defaultValue = null) {
  const [state, setState] = usePanelState();

  function setField(value) {
    setState((s) => ({ ...(s || {}), [field]: value }));
  }

  const currentValue = state[field];

  return [currentValue === undefined ? defaultValue : currentValue, setField];
}

const Value: React.FC<{ value: string; className: string }> = ({ value }) => {
  return <>{value}</>;
};

// a react hook that fetches a list of brain results
// and has a loading state and an error state
const useBrainResult = () => usePanelField("brainResult", null);
function useBrainResultsSelector() {
  const [selected, setSelected] = useBrainResult();
  const dataset = useRecoilValue(fos.dataset);
  const [colorByField, setColorByField] = useColorByField();
  const handlers = {
    onSelect(selected) {
      setSelected(selected);
      setColorByField(null);
    },
    value: selected,
    toKey: (item) => item.key,
    useSearch: (search) => ({
      values: dataset.brainMethods
        .filter((item) => item.key.toLowerCase().includes(search.toLowerCase()))
        .map((item) => {
          return item.key;
        }),
    }),
  };

  return {
    handlers,
    brainKey: selected,
    canSelect: dataset?.brainMethods?.length > 0,
    hasSelection: selected !== null,
  };
}

function useColorByChoices() {
  const datasetName = useRecoilValue(fos.datasetName);
  const [brainKey] = useBrainResult();
  const [isLoading, setIsLoading] = useState(false);
  const [availableFields, setAvailableFields] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (brainKey) {
      setIsLoading(true);
      fetchColorByChoices({ datasetName, brainKey })
        .then((r) => {
          setIsLoading(false);
          setAvailableFields(["uncolored", ...r.fields]);
        })
        .catch((e) => {
          setIsLoading(false);
          setError(e);
        });
    }
  }, [datasetName, brainKey]);

  return {
    availableFields,
    isLoading,
  };
}

// a react hook that allows for selecting a label
// based on the available labels in the given sample
const useColorByField = () => usePanelField("colorByField", null);
function useLabelSelector() {
  const dataset = useRecoilValue(fos.dataset);
  const fullSchema = useRecoilValue(fos.fullSchema);
  const [label, setLabel] = useColorByField();
  const { availableFields, isLoading } = useColorByChoices();

  const handlers = {
    onSelect(selected) {
      if (selected === "uncolored") {
        selected = null;
      }
      setLabel(selected);
    },
    value: label,
    toKey: (item) => item,
    useSearch: (search) => ({
      values:
        availableFields &&
        availableFields.filter((item) =>
          item.toLowerCase().includes(search.toLowerCase())
        ),
    }),
  };

  return {
    label,
    handlers,
    isLoading,
    canSelect: !isLoading && availableFields && availableFields.length > 0,
  };
}

const SELECTION_MODES = [
  { id: "patches", label: "Patches" },
  { id: "select", label: "Select" },
  { id: "match", label: "Match" },
];

function useChooseSelectionMode({ onSelect }) {
  const [mode, setMode] = usePanelField("selectionMode");
  const info = useBrainResultInfo();
  const handlers = {
    onSelect(selected) {
      setMode(selected);
      onSelect(selected);
    },
    value: mode,
    toKey: (item) => item.id,
    useSearch: (search) => ({
      values: SELECTION_MODES.map((m) => m.id),
    }),
  };
  return {
    mode,
    handlers,
    show: info && !!info.config.patchesField,
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

export default function Embeddings({ containerHeight, dimensions }) {
  const el = useRef();
  const brainResultSelector = useBrainResultsSelector();
  const labelSelector = useLabelSelector();
  const setView = fos.useSetView();
  const setSelectionModeView = useSetSelectionModeView();
  const modeSelector = useChooseSelectionMode({
    onSelect: (mode) => {
      if (!mode) {
        setView([]);
      } else {
        setSelectionModeView(mode);
      }
    },
  });
  const brainResultInfo = useBrainResultInfo();
  const canSelect = brainResultSelector.canSelect;
  const showPlot = brainResultSelector.hasSelection && !labelSelector.isLoading;

  if (canSelect)
    return (
      <EmbeddingsContainer ref={el}>
        <Selectors>
          <Selector
            {...brainResultSelector.handlers}
            placeholder={"Brain Result"}
            overflow={true}
            component={Value}
          />
          {labelSelector.isLoading && <Loading />}
          {brainResultSelector.hasSelection && !labelSelector.isLoading && (
            <Selector
              {...labelSelector.handlers}
              placeholder={"Color By"}
              overflow={true}
              component={Value}
            />
          )}
        </Selectors>
        {showPlot && (
          <EmbeddingsPlot
            bounds={dimensions.bounds}
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

// a function that sorts strings alphabetically
// but puts numbers at the end
function sortStringsAlphabetically(a, b) {
  return a.localeCompare(b);
}

// a function that returns the index of an object in an array
// that has a given value for a given key
function findIndexByKeyValue(array, key, value) {
  for (var i = 0; i < array.length; i++) {
    if (array[i][key] === value) {
      return i;
    }
  }
  return null;
}

function tracesToData(traces, style, getColor, plotSelection) {
  const isCategorical = style === "categorical";
  const isUncolored = style === "uncolored";
  return Object.entries(traces)
    .sort((a, b) => sortStringsAlphabetically(a[0], b[0]))
    .map(([key, trace]) => {
      // const selectedpoints = trace
      //   .map((d, idx) => (d.selected ? idx : null))
      //   .filter((d) => d !== null);
      const selectedpoints = plotSelection?.length
        ? plotSelection
            .map((id) => findIndexByKeyValue(trace, "id", id))
            .filter((p) => p !== null)
        : null;

      // const color = Color.fromCSSRGBValues(r, g, b)

      const color = Color.fromCSSRGBValues(...getColor(key));

      return {
        x: trace.map((d) => d.points[0]),
        y: trace.map((d) => d.points[1]),
        ids: trace.map((d) => d.id),
        type: "scattergl",
        mode: "markers",
        marker: {
          color: isCategorical
            ? trace.map((d) => {
                const selected =
                  plotSelection?.length == 0 || plotSelection?.includes(d.id);
                if (selected) {
                  return color.toCSSRGBString();
                } else {
                  return color
                    .setBrightness(color.getBrightness() * 0.05)
                    .toCSSRGBString();
                }
              })
            : isUncolored
            ? null
            : trace.map((d) => d.label),
          size: 6,
          colorbar:
            isCategorical || isUncolored
              ? undefined
              : {
                  lenmode: "fraction",
                  x: 1,
                  y: 0.5,
                },
        },
        name: key,
        selectedpoints,
        selected: {
          marker: {
            opacity: 1,
          },
        },
        unselected: {
          marker: {
            // color: color.setBrightness(0.2).toCSSRGBString(),
            opacity: 0.2,
          },
        },
      };
    });
}

function EmbeddingsPlot({ brainKey, labelField, el, bounds }) {
  const getColor = useRecoilValue(fos.colorMapRGB(true));

  const {
    traces,
    style,
    valuesCount,
    isLoading,
    handleSelected,
    hasExtendedSelection,
    clearSelection,
    plotSelection,
  } = useEmbeddings(brainKey, labelField);

  if (isLoading || !traces) return <h3>Pixelating...</h3>;
  const data = tracesToData(traces, style, getColor, plotSelection);
  const isCategorical = style === "categorical";

  return (
    <div style={{ height: "100%" }}>
      {bounds?.width && (
        <Plot
          data={data}
          onSelected={(selected, foo) => {
            console.log("on selected", { selected, foo });
            if (!selected || selected?.points?.length === 0) return;

            let result = {};
            let pointIds = [];
            for (const p of selected.points) {
              if (!result[p.fullData.name]) {
                result[p.fullData.name] = [];
              }
              result[p.fullData.name].push(p.id);
              pointIds.push(p.id);
            }
            handleSelected(pointIds);
          }}
          onDeselect={() => {
            console.log("on deselected");
            handleSelected(null);
          }}
          config={{ scrollZoom: true, displaylogo: false, responsive: true }}
          layout={{
            uirevision: true,
            font: {
              family: "var(--joy-fontFamily-body)",
              size: 14,
            },
            showlegend: isCategorical,
            width: bounds.width - 150, // TODO - remove magic value!
            height: bounds.height - 100, // TODO - remove magic value!
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
            margin: {
              t: 0,
              l: 0,
              b: 0,
              r: 0,
              pad: 0,
            },
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            legend: {
              x: 0.9,
              y: 0.9,
              bgcolor: "rgba(51,51,51, 1)",
              font: {
                color: "rgb(179, 179, 179)",
              },
            },
          }}
        />
      )}
    </div>
  );
}

function useBrainResultInfo() {
  const datasetName = useRecoilValue(fos.datasetName);
  const [brainKey] = useBrainResult();
  const dataset = useRecoilValue(fos.dataset);

  if (brainKey && dataset) {
    const info = dataset.brainMethods.find((d) => d.key === brainKey);
    return info;
  }
  return null;
}

function useEmbeddings(brainKey, labelField) {
  const plot = useLoadedPlot(onLoaded);
  const datasetName = useRecoilValue(fos.datasetName);
  const [extendedSelection, setExtendedSelection] = useRecoilState(
    fos.extendedSelection
  );
  const [selectedSamples, setSelectedSamples] = useRecoilState(
    fos.selectedSamples
  );
  const hasExtendedSelection =
    extendedSelection && extendedSelection.length > 0;
  const [plotSelection, setPlotSelection] = usePanelField("plotSelection", []);
  const [overrideStage, setOverrideStage] = useRecoilState(
    fos.extendedSelectionOverrideStage
  );

  function onLoaded({ selected_ids }) {
    setPlotSelection(selected_ids);
  }
  function clearSelection() {
    setExtendedSelection(null);
    setPlotSelection(null);
  }

  useEffect(() => {
    const selected = Array.from(selectedSamples);

    if (selected && selected.length) {
      setPlotSelection(selected);
    } else if (extendedSelection && extendedSelection.length) {
      setPlotSelection(extendedSelection);
    } else {
      setPlotSelection(null);
    }
  }, [selectedSamples, extendedSelection]);

  function handleSelected(selectedResults) {
    // if (selectedResults.length === 0) return;
    // setPlotSelection(selectedResults);
    console.log("setting extended selection", selectedResults);
    setExtendedSelection(selectedResults);
    if (selectedResults === null) {
      setOverrideStage(null);
      setSelectedSamples(new Set());
    }
  }

  return {
    ...plot,
    datasetName,
    brainKey,
    handleSelected,
    hasExtendedSelection,
    clearSelection,
    plotSelection,
  };
}

const EMPTY_ARRAY = [];

function useLoadedPlot(onLoaded) {
  const datasetName = useRecoilValue(fos.datasetName);
  const [brainKey] = useBrainResult();
  const [labelField] = useColorByField();
  const view = useRecoilValue(fos.view);
  const [loadedPlot, setLoadedPlot] = usePanelField("loadedPlot", null);
  const [loadingPlot, setLoadingPlot] = usePanelField("loadingPlot", true);
  const [plotSelection, setPlotSelection] = usePanelField(
    "plotSelection",
    EMPTY_ARRAY
  );
  const [loadingPlotError, setLoadingPlotError] = usePanelField(
    "loadingPlotError",
    null
  );
  const filters = useRecoilValue(fos.filters);
  const extended = useRecoilValue(fos.extendedStagesUnsorted);
  const [overrideStage, setOverrideStage] = useRecoilState(
    fos.extendedSelectionOverrideStage
  );
  const [extendedSelection, setExtendedSelection] = useRecoilState(
    fos.extendedSelection
  );

  // build the initial plot on load
  useEffect(() => {
    console.log("initial load");
    setLoadingPlot(true);
    handleInitialPlotLoad({ datasetName, brainKey, view, labelField })
      .catch((err) => setLoadingPlotError(err))
      .then((res) => {
        onLoaded(res);
        setLoadingPlotError(null);
        setLoadedPlot(res);
      })
      .finally(() => setLoadingPlot(false));
  }, [datasetName, brainKey, labelField]);

  // updated the selection when the extended view updates
  useEffect(() => {
    console.log("updated the selection when the extended view updates", {
      view,
      extended,
      filters,
      extendedSelection,
    });

    if (loadedPlot) {
      const resolvedExtended = extendedSelection ? extended : null;
      fetchUpdatedSelection({
        datasetName,
        brainKey,
        view,
        filters,
        extended: resolvedExtended,
        extendedSelection,
      }).then((res) => {
        console.log("setting plot selection to", res.selected);
        setPlotSelection(res.selected);
      });
    }
  }, [datasetName, brainKey, view, filters, extendedSelection]);

  // update the extended stages based on the current view
  useEffect(() => {
    console.log(
      "update the extended stages based on the current view",
      view,
      plotSelection
    );
    if (loadedPlot && Array.isArray(extendedSelection)) {
      fetchExtendedStage({
        datasetName,
        view,
        patchesField: loadedPlot.patches_field,
        selection: extendedSelection,
      }).then((res) => {
        setOverrideStage({
          [res._cls]: res.kwargs,
        });
      });
    }
  }, [datasetName, loadedPlot?.patches_field, view, extendedSelection]);
  return {
    ...(loadedPlot || {}),
    isLoading: loadingPlot,
    error: loadingPlotError,
  };
}

async function handleInitialPlotLoad({
  datasetName,
  brainKey,
  view,
  labelField,
}) {
  const res = await getFetchFunction()("POST", "/embeddings/plot", {
    datasetName,
    brainKey,
    view,
    labelField,
  });
  return res;
}

async function fetchUpdatedSelection(params) {
  const { dataset, brainKey, view, filters, extended, extendedSelection } =
    params;

  return getFetchFunction()("POST", "/embeddings/selection", params);
}

async function fetchExtendedStage(params) {
  const { datasetName, view, patchesField, selection } = params;
  return getFetchFunction()("POST", "/embeddings/extended-stage", params);
}

async function fetchColorByChoices(params) {
  const { datasetName, brainKey } = params;
  return getFetchFunction()("POST", "/embeddings/color-by-choices", params);
}
class Color {
  static fromCSSRGBValues(r, g, b) {
    return new Color(r / 255, g / 255, b / 255);
  }
  setBrightness(n: number) {
    const brightness = this.getBrightness();
    const diff = n - brightness;
    return new Color(this.r + diff, this.g + diff, this.b + diff);
  }
  getBrightness() {
    return (this.r + this.g + this.b) / 3;
  }
  constructor(public r: number, public g: number, public b: number) {}
  toCSSRGBString() {
    return `rgb(${this.r * 255}, ${this.g * 255}, ${this.b * 255})`;
  }
}

function useSetSelectionModeView() {
  const [plotSelection] = usePanelField("plotSelection");
  const brainResultInfo = useBrainResultInfo();
  const patchesField = brainResultInfo?.config?.patchesField;
  const setFilterLabelIds = useSetFilterLabelIds();
  const toPatches = useToPatches();

  const setView = (mode) => {
    if (mode === "select" && plotSelection && plotSelection.length > 0) {
      // setFilterLabelIds(patchesField, plotSelection)
    } else if (mode === "patches") {
      // toPatches(patchesField);
    }
  };

  return setView;
}

function useSetFilterLabelIds() {
  const setView = fos.useSetView();
  return useRecoilCallback(
    ({ set }) =>
      async (field, ids) => {
        setView([
          {
            _cls: "fiftyone.core.stages.FilterLabels",
            kwargs: [
              ["field", field],
              ["filter", { $in: ["$$this._id", ids] }],
            ],
          },
        ]);
      },
    []
  );
}

// selection mode
/**
 * Always show objects in the plot.
 * select - when lasso objects, add a filter_labels stage to the extended view
 * match - when lasso objects, add a match_labels stage to the extended view
 * patches - force the fos.view to be patches
 */

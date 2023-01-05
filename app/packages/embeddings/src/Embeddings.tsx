import { useEffect, useState, useRef, useLayoutEffect, Fragment } from "react";
import {
  useRecoilState,
  useRecoilValue,
  useRecoilCallback,
  atom,
} from "recoil";
import * as fos from "@fiftyone/state";
import { getFetchFunction, useExternalLink } from "@fiftyone/utilities";
import Plot from "react-plotly.js";
import { Loading, Selector, useTheme, Link } from "@fiftyone/components";
import styled from "styled-components";
import { useToPatches } from "@fiftyone/state";
import { usePanelState, usePanelStatePartial } from "@fiftyone/spaces";
import {
  HighlightAlt,
  Close,
  Help,
  OpenWith,
  Warning,
} from "@mui/icons-material";

const Value: React.FC<{ value: string; className: string }> = ({ value }) => {
  return <>{value}</>;
};

// a react hook that fetches a list of brain results
// and has a loading state and an error state
const useBrainResult = () => usePanelStatePartial("brainResult", null);
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
const useColorByField = () => usePanelStatePartial("colorByField", null);
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
  const [mode, setMode] = usePanelStatePartial("selectionMode");
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
  margin: 0;
  height: 100%;
  width: 100%;
`;

const Selectors = styled.div`
  display: flex;
  gap: 1rem;
  position: absolute;
  top: 1rem;
  display: flex;
  column-gap: 1rem;
  z-index: 999;
  padding: 0 1rem;
  // width: 100%;
  // justify-content: space-between;
  > div {
    display: flex;
    column-gap: 1rem;
    margin: 0 1rem;
  }
`;

const PlotOption = styled(Link)`
  display: flex;
  color: var(--joy-palette-primary-plainColor);
  align-items: center;
  cursor: pointer;
  border-bottom: 1px var(--joy-palette-primary-plainColor) solid;
  background: var(--joy-palette-neutral-softBg);
  border-top-left-radius: 3px;
  border-top-right-radius: 3px;
  padding: 0.25rem;
`;

const WarningsContainer = styled.ul`
  position: absolute;
  top: 3rem;
  z-index: 999;
  list-style: none;
  padding-inline-start: 0;
  background: var(--joy-palette-background-level1);
  > li {
    margin: 1rem 0;
  }
`;

const WarningItem = styled.li`
  display: flex;
  column-gap: 1rem;
  color: var(--joy-palette-text-plainColor);
  padding: 0 2.5rem 0 1rem;
  border-radius: 3px;
  list-style: none;
  svg {
    position: relative;
    top: 3px;
  }
`;

const WarningClose = styled.div`
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  cursor: pointer;
`;

function Warnings() {
  const warnings = useWarnings();
  if (!warnings.visible) return null;

  return (
    <WarningsContainer>
      <WarningClose>
        <Close onClick={warnings.hide} />
      </WarningClose>
      {warnings.items.map((msg) => (
        <WarningItem>
          <div>
            <Warning />
          </div>
          <div>{msg}</div>
        </WarningItem>
      ))}
    </WarningsContainer>
  );
}

function useWarnings() {
  const [state, _setState] = usePanelStatePartial("warnings", { warnings: [] });
  const { warnings } = state;
  const hasWarnings = Array.isArray(warnings) && warnings.length > 0;
  const setState = (fn) => {
    _setState((s) => fn(s || { warnings: [] }));
  };

  return {
    hasWarnings,
    items: warnings,
    visible: hasWarnings && state.visible,
    count: Array.isArray(warnings) ? warnings.length : null,
    show() {
      setState((s) => ({ ...s, visible: true }));
    },
    hide() {
      setState((s) => ({ ...s, visible: false, userHidden: true }));
    },
    clear() {
      setState((s) => ({ ...s, warnings: null }));
    },
    add(msg) {
      setState((s) => ({
        ...s,
        visible: true,
        warnings: [...(s.warnings || []), msg],
      }));
    },
  };
}

export default function Embeddings({ containerHeight, dimensions }) {
  const el = useRef();
  const theme = useTheme();
  const brainResultSelector = useBrainResultsSelector();
  const labelSelector = useLabelSelector();
  const setView = fos.useSetView();
  const brainResultInfo = useBrainResultInfo();
  const canSelect = brainResultSelector.canSelect;
  const showPlot = brainResultSelector.hasSelection && !labelSelector.isLoading;
  const plotSelection = usePlotSelection();
  const [dragMode, setDragMode] = usePanelStatePartial("dragMode", "lasso");
  const warnings = useWarnings();

  const selectorStyle = {
    background: theme.neutral.softBg,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    padding: "0.25rem",
  };

  if (canSelect)
    return (
      <EmbeddingsContainer ref={el}>
        <Selectors>
          <div>
            <Selector
              {...brainResultSelector.handlers}
              placeholder={"Brain Result"}
              overflow={true}
              component={Value}
              containerStyle={selectorStyle}
            />
            {labelSelector.isLoading && <Loading />}
            {brainResultSelector.hasSelection && !labelSelector.isLoading && (
              <Selector
                {...labelSelector.handlers}
                placeholder={"Color By"}
                overflow={true}
                component={Value}
                containerStyle={selectorStyle}
              />
            )}
            {plotSelection.hasSelection && (
              <PlotOption
                to={plotSelection.clearSelection}
                title={"Reset (Esc)"}
              >
                <Close />
              </PlotOption>
            )}
            {showPlot && (
              <Fragment>
                <PlotOption
                  style={{ opacity: dragMode !== "lasso" ? 0.5 : 1 }}
                  to={() => setDragMode("lasso")}
                  title={"Select (s)"}
                >
                  <HighlightAlt />
                </PlotOption>

                <PlotOption
                  style={{ opacity: dragMode !== "pan" ? 0.5 : 1 }}
                  to={() => setDragMode("pan")}
                  title={"Pan (g)"}
                >
                  <OpenWith />
                </PlotOption>

                {warnings.count > 0 && (
                  <PlotOption to={() => warnings.show()} title={"Warnings"}>
                    <Warning style={{ marginRight: "0.5rem" }} />
                    {warnings.count}
                  </PlotOption>
                )}
                <Warnings />

                <PlotOption
                  href={
                    "https://voxel51.com/docs/fiftyone/user_guide/plots.html"
                  }
                  title={"Help"}
                  to={useExternalLink("https://docs.voxel51.com")}
                  target={"_blank"}
                >
                  <Help />
                </PlotOption>
              </Fragment>
            )}
          </div>
        </Selectors>
        {showPlot && (
          <EmbeddingsPlot
            plotSelection={plotSelection}
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

function getPointIndex(trace, id) {
  let idx = findIndexByKeyValue(trace, "id", id);
  if (idx === undefined || idx === null) {
    idx = findIndexByKeyValue(trace, "sample_id", id);
  }
  if (idx === null) {
    debugger;
  }
  return idx;
}

function tracesToData(traces, style, getColor, plotSelection, selectionStyle) {
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
            .map((id) => getPointIndex(trace, id))
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
                  plotSelection?.length == 0 ||
                  (plotSelection && plotSelection.includes(d.id));
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
            size: selectionStyle === "selected" ? 10 : 6,
            color: selectionStyle === "selected" ? "orange" : undefined,
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

// a react hook that returns true when the given key is down
function useKeyDown(key, handler) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === key) {
        handler(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [key]);
}

function EmbeddingsPlot({ brainKey, labelField, el, bounds, plotSelection }) {
  const getColor = useRecoilValue(fos.colorMapRGB(true));
  const datasetName = useRecoilValue(fos.datasetName);
  const {
    setPlotSelection,
    resolvedSelection,
    clearSelection,
    handleSelected,
    selectionStyle,
  } = plotSelection;
  const { isLoading, traces, style } = useLoadedPlot(plotSelection);
  const [dragMode, setDragMode] = usePanelStatePartial("dragMode", "lasso");
  useKeyDown("s", () => setDragMode("lasso"));
  useKeyDown("g", () => setDragMode("pan"));
  useKeyDown("Escape", clearSelection);

  if (isLoading || !traces) return <Loading>Pixelating...</Loading>;
  console.log({ resolvedSelection });
  const data = tracesToData(
    traces,
    style,
    getColor,
    resolvedSelection,
    selectionStyle
  );
  const isCategorical = style === "categorical";

  return (
    <div style={{ height: "100%" }}>
      {bounds?.width && (
        <Plot
          data={data}
          style={{ zIndex: 1 }}
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
          config={{
            scrollZoom: true,
            displaylogo: false,
            responsive: true,
            displayModeBar: false,
          }}
          layout={{
            dragmode: dragMode,
            uirevision: true,
            font: {
              family: "var(--joy-fontFamily-body)",
              size: 14,
            },
            showlegend: isCategorical,
            width: bounds.width,
            height: bounds.height,
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

function usePlotSelection() {
  const [filters, setFilters] = useRecoilState(fos.filters);
  const [overrideStage, setOverrideStage] = useRecoilState(
    fos.extendedSelectionOverrideStage
  );
  const [extendedSelection, setExtendedSelection] = useRecoilState(
    fos.extendedSelection
  );
  const [selectedSamples, setSelectedSamples] = useRecoilState(
    fos.selectedSamples
  );
  const hasExtendedSelection =
    extendedSelection && extendedSelection.length > 0;
  const [plotSelection, setPlotSelection] = usePanelStatePartial(
    "plotSelection",
    []
  );
  function handleSelected(selectedResults) {
    setSelectedSamples(new Set());
    setExtendedSelection(selectedResults);
    if (selectedResults === null) {
      clearSelection();
    }
  }

  function clearSelection() {
    setExtendedSelection(null);
    setPlotSelection(null);
    setOverrideStage(null);
    setSelectedSamples(new Set());
    setFilters({});
  }
  let selectionStyle = null;
  const selected = Array.from(selectedSamples);
  let resolvedSelection = null;
  if (selected && selected.length) {
    resolvedSelection = selected;
    selectionStyle = "selected";
  } else if (extendedSelection && extendedSelection.length) {
    resolvedSelection = extendedSelection;
    selectionStyle = "extended";
  }

  useEffect(() => {
    console.log("setting plot selection", resolvedSelection);
    setPlotSelection(resolvedSelection);
  }, [selectedSamples, extendedSelection]);
  const hasSelection = resolvedSelection !== null;
  return {
    setPlotSelection,
    handleSelected,
    clearSelection,
    resolvedSelection,
    hasSelection,
    selectionStyle,
  };
}

const EMPTY_ARRAY = [];

function useLoadedPlot({ clearSelection, setPlotSelection }) {
  const datasetName = useRecoilValue(fos.datasetName);
  const [selectedSamples, setSelectedSamples] = useRecoilState(
    fos.selectedSamples
  );
  const [brainKey] = useBrainResult();
  const [labelField] = useColorByField();
  const view = useRecoilValue(fos.view);
  const [loadedPlot, setLoadedPlot] = usePanelStatePartial("loadedPlot", null);
  const [loadingPlot, setLoadingPlot] = usePanelStatePartial(
    "loadingPlot",
    true
  );
  const [loadingPlotError, setLoadingPlotError] = usePanelStatePartial(
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
  const warnings = useWarnings();

  // build the initial plot on load
  useEffect(() => {
    console.log("initial load");
    clearSelection();
    setOverrideStage(null);
    setLoadingPlot(true);
    handleInitialPlotLoad({ datasetName, brainKey, view, labelField })
      .catch((err) => setLoadingPlotError(err))
      .then((res) => {
        console.log(res);
        /**
         * 
# not_used_count: num of embeddings not in current view
not_used_count = index_size - available_count

# missing_count: num of samples / patches in the current view but do not have corresponding embeddings

         */
        const notUsed = res.index_size - res.available_count;
        const missing = res.missing_count;
        const total = res.index_size;
        const type = res.patches_field ? "patches" : "samples";

        warnings.clear();

        if (missing > 0) {
          warnings.add(
            `${missing} ${type} are included in the current view but do not have corresponding embeddings.`
          );
        }

        if (notUsed > 0) {
          warnings.add(
            `Not all embeddings are used in the current view. ${notUsed} embeddings are not used.`
          );
        }

        setLoadingPlotError(null);
        setPlotSelection(res.selected_ids);
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
        const resolved =
          res.selected || selectedSamples ? Array.from(selectedSamples) : null;
        console.log("setting plot selection to", resolved);
        setPlotSelection(resolved);
      });
    }
  }, [
    datasetName,
    brainKey,
    view,
    filters,
    extendedSelection,
    selectedSamples,
  ]);

  // update the extended stages based on the current view
  useEffect(() => {
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

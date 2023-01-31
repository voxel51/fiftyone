import { useRef, Fragment } from "react";
import { useExternalLink } from "@fiftyone/utilities";
import { Loading, Selector, useTheme } from "@fiftyone/components";
import { usePanelStatePartial } from "@fiftyone/spaces";
import {
  HighlightAlt,
  Close,
  Help,
  OpenWith,
  Warning,
  CenterFocusWeak,
} from "@mui/icons-material";
import { useBrainResultsSelector } from "./useBrainResult";
import { useLabelSelector } from "./useLabelSelector";
import {
  EmbeddingsContainer,
  Selectors,
  PlotOption,
} from "./styled-components";
import { Warnings } from "./Warnings";
import { useWarnings } from "./useWarnings";
import { EmbeddingsPlot } from "./EmbeddingsPlot";
import { usePlotSelection } from "./usePlotSelection";
import { useResetPlotZoom } from "./useResetPlotZoom";

const Value: React.FC<{ value: string; className: string }> = ({ value }) => {
  return <>{value}</>;
};

export default function Embeddings({ containerHeight, dimensions }) {
  const el = useRef();
  const theme = useTheme();
  const resetZoom = useResetPlotZoom();
  const brainResultSelector = useBrainResultsSelector();
  const labelSelector = useLabelSelector();
  const canSelect = brainResultSelector.canSelect;
  const showPlot = brainResultSelector.hasSelection;
  const plotSelection = usePlotSelection();
  const [dragMode, setDragMode] = usePanelStatePartial(
    "dragMode",
    "lasso",
    true
  );
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
                title={"Clear Selection (Esc)"}
              >
                <Close />
              </PlotOption>
            )}
            {showPlot && (
              <Fragment>
                <PlotOption to={() => resetZoom()} title={"Reset Zoom (Esc)"}>
                  <CenterFocusWeak />
                </PlotOption>
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
                    "https://docs.voxel51.com/user_guide/app.html#embeddings-panel"
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
            labelSelectorLoading={labelSelector.isLoading}
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

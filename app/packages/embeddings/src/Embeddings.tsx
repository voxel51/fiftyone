import { MuiButton, Selector, useTheme } from "@fiftyone/components";
import { OperatorPlacements, types } from "@fiftyone/operators";
import { usePanelStatePartial, useSetPanelCloseEffect } from "@fiftyone/spaces";
import { constants, useExternalLink } from "@fiftyone/utilities";
import {
  Add,
  CenterFocusWeak,
  Close,
  Help,
  HighlightAlt,
  OpenWith,
  Warning,
} from "@mui/icons-material";
import { Fragment, useEffect, useRef, useState } from "react";
import EmbeddingsCTA from "./EmbeddingsCTA";
import { EmbeddingsPlot } from "./EmbeddingsPlot";
import {
  EmbeddingsContainer,
  PlotOption,
  Selectors,
} from "./styled-components";
import { useBrainResultsSelector } from "./useBrainResult";
import useComputeVisualization from "./useComputeVisualization";
import { useLabelSelector } from "./useLabelSelector";
import { usePlotSelection } from "./usePlotSelection";
import { useResetPlotZoom } from "./useResetPlotZoom";
import { useWarnings } from "./useWarnings";
import { Warnings } from "./Warnings";

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
  const [showCTA, setShowCTA] = useState(false);

  const warnings = useWarnings();
  const setPanelCloseEffect = useSetPanelCloseEffect();
  const embeddingsDocumentationLink = useExternalLink(
    "https://docs.voxel51.com"
  );
  const computeViz = useComputeVisualization();

  useEffect(() => {
    setPanelCloseEffect(() => {
      plotSelection.clearSelection();
    });
  }, [setPanelCloseEffect, plotSelection]);

  const selectorStyle = {
    background: theme.neutral.softBg,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    padding: "0.25rem",
  };

  if (canSelect && !showCTA)
    return (
      <EmbeddingsContainer ref={el} data-cy="embeddings-container">
        <Selectors>
          <div>
            <Selector
              cy="embeddings"
              {...brainResultSelector.handlers}
              placeholder={"Select brain key"}
              overflow={true}
              component={Value}
              resultsPlacement="bottom-start"
              containerStyle={selectorStyle}
            />
            {brainResultSelector.hasSelection && !labelSelector.isLoading && (
              <Selector
                cy="embeddings-colorby"
                {...labelSelector.handlers}
                placeholder={"Color by"}
                overflow={true}
                component={Value}
                resultsPlacement="bottom-start"
                containerStyle={selectorStyle}
              />
            )}
            <PlotOption
              to={() => {
                if (constants.IS_APP_MODE_FIFTYONE) {
                  setShowCTA(true);
                } else {
                  computeViz.prompt();
                }
              }}
              title={"Compute visualization"}
            >
              <Add />
            </PlotOption>
            {!plotSelection.selectionIsExternal && (
              <PlotOption
                to={plotSelection.clearSelection}
                title={"Clear selection (Esc)"}
              >
                <Close />
              </PlotOption>
            )}
            {showPlot && (
              <Fragment>
                <PlotOption to={() => resetZoom()} title={"Reset zoom (Esc)"}>
                  <CenterFocusWeak />
                </PlotOption>
                <PlotOption
                  cy="embeddings-plot-option-lasso"
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
                  to={embeddingsDocumentationLink}
                  target={"_blank"}
                >
                  <Help />
                </PlotOption>
              </Fragment>
            )}
            <OperatorPlacements place={types.Places.EMBEDDINGS_ACTIONS} />
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
  return (
    <EmbeddingsCTA
      mode={canSelect ? "default" : "onboarding"}
      onBack={() => {
        setShowCTA(false);
      }}
    />
  );
}

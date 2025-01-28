import { useTrackEvent } from "@fiftyone/analytics";
import { CenteredStack, CodeBlock, scrollable } from "@fiftyone/components";
import { clearUseKeyStores } from "@fiftyone/core/src/plugins/SchemaIO/hooks";
import {
  PanelSkeleton,
  usePanelLoading,
  usePanelState,
  useSetPanelCloseEffect,
} from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { Box, Typography } from "@mui/material";
import { useEffect, useRef } from "react";
import OperatorIO from "./OperatorIO";
import { PANEL_LOAD_TIMEOUT } from "./constants";
import { useActivePanelEventsCount } from "./hooks";
import { Property } from "./types";
import { CustomPanelProps, useCustomPanelHooks } from "./useCustomPanelHooks";
import usePanelEvent from "./usePanelEvent";
import { isNullish } from "@fiftyone/utilities";

export function CustomPanel(props: CustomPanelProps) {
  const { panelId, dimensions, panelName, panelLabel, isModalPanel } = props;
  const { height, width } = dimensions?.bounds || {};
  const { count } = useActivePanelEventsCount(panelId);
  const [_, setLoading] = usePanelLoading(panelId);
  const triggerPanelEvent = usePanelEvent();

  const {
    handlePanelStateChange,
    handlePanelStatePathChange,
    panelSchema,
    data,
    onLoadError,
  } = useCustomPanelHooks(props);
  const pending = fos.useTimeout(PANEL_LOAD_TIMEOUT);
  const setPanelCloseEffect = useSetPanelCloseEffect();
  const trackEvent = useTrackEvent();

  useEffect(() => {
    setPanelCloseEffect(() => {
      clearUseKeyStores(panelId);
      trackEvent("close_panel", { panel: panelName });
      if (props.onUnLoad) {
        triggerPanelEvent(panelId, { operator: props.onUnLoad });
      }
    });
  }, []);

  useEffect(() => {
    setLoading(count > 0);
  }, [setLoading, count]);

  if (pending && !panelSchema && !onLoadError) {
    return <PanelSkeleton />;
  }

  if (!panelSchema)
    return (
      <CenteredStack spacing={1}>
        <Typography variant="h4">{panelLabel || "Operator Panel"}</Typography>
        <Typography color="text.secondary">
          Operator panel &quot;
          <Typography component="span">{panelName}</Typography>&quot; is not
          configured yet.
        </Typography>
        <Typography component="pre" color="text.tertiary">
          {panelId}
        </Typography>
        {onLoadError && (
          <Box maxWidth="95%">
            <CodeBlock text={onLoadError} />
          </Box>
        )}
      </CenteredStack>
    );

  const schema = Property.fromJSON(panelSchema);

  return (
    <Box
      className={scrollable}
      sx={{
        height: "100%",
        width: "100%",
        position: "relative",
        overflow: "auto",
      }}
    >
      <Box ref={dimensions.widthRef} sx={{ height: "100%" }}>
        <DimensionRefresher dimensions={dimensions}>
          <OperatorIO
            id={panelId}
            schema={schema}
            onChange={handlePanelStateChange}
            data={data}
            layout={{ height, width }}
            onPathChange={handlePanelStatePathChange}
            shouldClearUseKeyStores={false}
            isModalPanel={isModalPanel}
            updatableDefaultValue={false}
          />
        </DimensionRefresher>
      </Box>
    </Box>
  );
}

function DimensionRefresher(props) {
  const { dimensions, children } = props;

  useEffect(() => {
    dimensions?.refresh();
  }, []);

  return children;
}

export function defineCustomPanel({
  on_load,
  on_change,
  on_unload,
  on_change_ctx,
  on_change_view,
  on_change_dataset,
  on_change_current_sample,
  on_change_selected,
  on_change_selected_labels,
  on_change_extended_selection,
  on_change_group_slice,
  on_change_query_performance,
  on_change_spaces,
  panel_name,
  panel_label,
  reset_state,
}) {
  return (props) => {
    const { dimensions, panelNode, isModalPanel } = props;
    const [state, setState] = usePanelState();
    const [localState] = usePanelState(null, null, true);
    const hasState = !isNullish(state?.state);
    const isLoaded = localState?.loaded;
    const isReset = useRef(false);

    if (!isLoaded && hasState && reset_state) {
      if (!isReset.current) {
        setState({});
        isReset.current = true;
      }
      return null;
    }

    return (
      <CustomPanel
        panelId={panelNode?.id}
        onLoad={on_load}
        onUnLoad={on_unload}
        onChange={on_change}
        onChangeCtx={on_change_ctx}
        onChangeView={on_change_view}
        onChangeDataset={on_change_dataset}
        onChangeCurrentSample={on_change_current_sample}
        onChangeSelected={on_change_selected}
        onChangeSelectedLabels={on_change_selected_labels}
        onChangeExtendedSelection={on_change_extended_selection}
        onChangeGroupSlice={on_change_group_slice}
        onChangeQueryPerformance={on_change_query_performance}
        onChangeSpaces={on_change_spaces}
        dimensions={dimensions}
        panelName={panel_name}
        panelLabel={panel_label}
        isModalPanel={isModalPanel}
      />
    );
  };
}

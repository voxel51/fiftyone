import { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import { CenteredStack, CodeBlock } from "@fiftyone/components";
import {
  PanelSkeleton,
  usePanelState,
  useSetCustomPanelState,
} from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { Box, Typography } from "@mui/material";
import { merge } from "lodash";
import OperatorIO from "./OperatorIO";
import { PANEL_LOAD_TIMEOUT } from "./constants";
import { executeOperator } from "./operators";
import * as types from "./types";

import {
  useCustomPanelHooks,
  CustomPanelHooks,
  CustomPanelProps,
} from "./useCustomPanelHooks";

export function CustomPanel(props: CustomPanelProps) {
  const {
    panelId,
    onLoad,
    onChange,
    onUnLoad,
    onChangeCtx,
    onChangeView,
    onChangeDataset,
    onChangeCurrentSample,
    onChangeSelected,
    onChangeSelectedLabels,
    dimensions,
    panelName,
    panelLabel,
  } = props;
  const { height, width } = dimensions?.bounds || {};

  const {
    panelState,
    handlePanelStateChange,
    handlePanelStatePathChange,
    panelSchema,
    data,
  } = useCustomPanelHooks(props);
  const onLoadError = panelState?.onLoadError;
  const pending = fos.useTimeout(PANEL_LOAD_TIMEOUT);

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

  const schema = types.Property.fromJSON(panelSchema);

  return (
    <Box sx={{ height: "100%", width: "100%" }}>
      <OperatorIO
        schema={schema}
        onChange={handlePanelStateChange}
        data={data}
        layout={{ height, width }}
        onPathChange={handlePanelStatePathChange}
      />
    </Box>
  );
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
  panel_name,
  panel_label,
}) {
  return ({ panelNode, dimensions }) => (
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
      dimensions={dimensions}
      panelName={panel_name}
      panelLabel={panel_label}
    />
  );
}

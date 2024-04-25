import { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import { merge } from "lodash";

import OperatorIO from "./OperatorIO";
import * as types from "./types";
import * as fos from "@fiftyone/state";

import { usePanelState, useSetCustomPanelState } from "@fiftyone/spaces";

import {
  useCustomPanelHooks,
  CustomPanelHooks,
  CustomPanelProps,
} from "./useCustomPanelHooks";

export function CustomPanel(props: CustomPanelProps) {
  const { panelId, onLoad, onChange, onUnLoad, onViewChange, dimensions } =
    props;

  const {
    panelState,
    handlePanelStateChange,
    handlePanelStatePathChange,
    data,
    renderableSchema,
    loaded,
  } = useCustomPanelHooks(props);

  if (!renderableSchema)
    return (
      <div>
        <h1>Custom Panel</h1>
        <p>Custom panel is not configured yet.</p>
        <pre>{panelId}</pre>
      </div>
    );

  const schema = types.Property.fromJSON(renderableSchema);

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <OperatorIO
        schema={{
          ...schema,
          view: {
            ...schema.view,
            componentsProps: {
              gridContainer: {
                spacing: 0,
                sx: { pl: 0 },
                height: dimensions.height || 750,
                width: dimensions.width,
              },
            },
          },
        }}
        onPathChange={handlePanelStatePathChange}
        onChange={handlePanelStateChange}
        data={data}
      />
      <pre>{JSON.stringify({ schema, data }, null, 2)}</pre>
    </div>
  );
}

export function defineCustomPanel({
  on_load,
  on_change,
  on_unload,
  on_view_change,
}) {
  return ({ panelNode, dimensions }) => (
    <CustomPanel
      panelId={panelNode?.id}
      onLoad={on_load}
      onUnLoad={on_unload}
      onChange={on_change}
      onViewChange={on_view_change}
      dimensions={dimensions}
    />
  );
}

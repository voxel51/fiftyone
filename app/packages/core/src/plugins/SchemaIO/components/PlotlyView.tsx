import { useTheme } from "@fiftyone/components/src/components/ThemeProvider";
import { Box } from "@mui/material";
import React from "react";
import Plot from "react-plotly.js";
import { HeaderView } from ".";
import { getComponentProps } from "../utils";
import { merge } from "lodash";
import { usePanelState } from "@fiftyone/spaces";
import { executeOperator } from "@fiftyone/operators";

export default function PlotlyView(props) {
  console.log(props);
  const { data, schema } = props;
  const { view = {} } = schema;
  const { config = {}, layout = {} } = view;
  const theme = useTheme();
  const [selectedpoints, setSelectedPoints] = React.useState(null);
  let range = [0, 0];
  const handleEvent = (event?: string) => (e) => {
    if (view.controller) {
      // TODO: add more interesting/useful event data
      console.log("event", event);
      console.log("event_data", e);
      const data = EventDataMappers[event]?.(e) || {};
      const x_data_source = view.x_data_source;
      if (event === "onClick") {
        const values = e.points[0];
        let selected = [];
        let xBinsSize = null;
        let xValue = null;
        for (const p of e.points) {
          const { data, fullData } = p;
          const { x, y } = data;
          xBinsSize = fullData.xbins.size;
          selected = selected.concat(p.pointIndices);
          xValue = p.x;
        }
        //
        // TODO: histogram only
        //
        range = [xValue - xBinsSize / 2, xValue + xBinsSize / 2];
        console.log("range", range);
        if (selected.length === 0) {
          selected = null;
        }
        setSelectedPoints(selected);
      }
      executeOperator(view.controller, {
        event,
        panel_id: view.panel_id,
        data,
        x_data_source,
        range,
      });
    }
  };
  const eventHandlers = createPlotlyHandlers(handleEvent);

  const dataDefaults = {
    selectedpoints,
  };
  const layoutDefaults = {
    // dragmode: "lasso",
    // uirevision: 1,
    font: { family: "var(--fo-fontFamily-body)", size: 14 },
    showlegend: false,
    // width: "100%",
    // height: 700,
    // hovermode: false,
    xaxis: {
      showgrid: true,
      zeroline: false,
      visible: true,
    },
    yaxis: {
      showgrid: false,
      zeroline: false,
      visible: true,
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
      x: 1,
      y: 1,
      bgcolor: theme.background.level1,
      font: { color: theme.text.secondary },
    },
  };
  const configDefaults = {
    displaylogo: false,
    scrollZoom: true,
    responsive: true,
    displayModeBar: true,
  };

  const mergedLayout = merge({}, layoutDefaults, layout);
  const mergedConfig = merge({}, configDefaults, config);
  const mergedData = mergeData(data, dataDefaults);

  return (
    <Box
      {...getComponentProps(props, "container")}
      useResizeHandler
      sx={{ height: "100%", width: "100%" }}
    >
      <HeaderView {...props} nested />
      <Plot
        data={mergedData}
        style={{ height: "100%", width: "100%", zIndex: 1 }}
        config={mergedConfig}
        layout={mergedLayout}
        {...eventHandlers}
        {...getComponentProps(props, "plotly")}
      />
    </Box>
  );
}

function createPlotlyHandlers(handleEvent: any) {
  const PLOTLY_EVENTS = [
    // 'onAfterExport',
    // 'onAfterPlot',
    // 'onAnimated',
    // 'onAnimatingFrame',
    // 'onAnimationInterrupted',
    // 'onAutoSize',
    // 'onBeforeExport',
    // 'onBeforeHover',
    // 'onButtonClicked',
    "onClick",
    "onClickAnnotation",
    "onDeselect",
    "onDoubleClick",
    // 'onFramework',
    // 'onHover',
    // 'onLegendClick',
    // 'onLegendDoubleClick',
    // 'onRelayout',
    // 'onRelayouting',
    // 'onRestyle',
    // 'onRedraw',
    "onSelected",
    // 'onSelecting',
    "onSliderChange",
    "onSliderEnd",
    "onSliderStart",
    // 'onSunburstClick',
    // 'onTransitioning',
    // 'onTransitionInterrupted',
    // 'onUnhover',
    // 'onWebGlContextLost'
  ];
  let handlers = {} as any;
  for (const event of PLOTLY_EVENTS) {
    handlers[event] = handleEvent(event);
  }
  return handlers;
}

const EventDataMappers = {
  onClick: ({ event, points }) => {
    const { data, fullData, xaxis, yaxis, ...pointdata } = points[0];
    const { x, y, z, ...metadata } = data;
    const result = {
      ...pointdata,
      data: metadata,
    };
    return result;
  },
};

function mergeData(data, defaults) {
  return (data || []).map((trace) => {
    return {
      ...trace,
      ...defaults,
    };
  });
}

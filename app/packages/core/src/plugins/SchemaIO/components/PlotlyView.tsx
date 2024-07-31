import { useTheme } from "@fiftyone/components/src/components/ThemeProvider";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { Box } from "@mui/material";
import { merge, snakeCase } from "lodash";
import React, { useMemo } from "react";
import Plot from "react-plotly.js";
import { HeaderView } from ".";
import { getComponentProps } from "../utils";

export default function PlotlyView(props) {
  const { data, schema, path } = props;
  const { view = {} } = schema;
  const { config = {}, layout = {} } = view;
  const theme = useTheme();
  const panelId = usePanelId();
  let range = [0, 0];
  const triggerPanelEvent = usePanelEvent();
  const handleEvent = (event?: string) => (e) => {
    // TODO: add more interesting/useful event data
    const data = EventDataMappers[event]?.(e) || {};
    const x_data_source = view.x_data_source;
    let xValue = null;
    let yValue = null;
    if (event === "onClick") {
      const values = e.points[0];
      let selected = [];
      let xBinsSize = null;
      for (const p of e.points) {
        const { data, fullData } = p;
        const { x, y } = data;
        const { type } = fullData;
        if (type === "histogram") {
          xBinsSize = fullData.xbins.size;
          selected = selected.concat(p.pointIndices);
          xValue = p.x;
          range = [xValue - xBinsSize / 2, xValue + xBinsSize / 2];
        } else if (type === "scatter") {
          selected.push(p.pointIndex);
        } else if (type === "bar") {
          xValue = p.x;
          yValue = p.y;
        } else if (type === "heatmap") {
          xValue = p.x;
          yValue = p.y;
        }
      }
      if (selected.length === 0) {
        selected = null;
      }
    }

    const eventHandlerOperator = view[snakeCase(event)];

    if (eventHandlerOperator) {
      let params = {};
      if (event === "onClick") {
        params = {
          event,
          data,
          x_data_source,
          range,
          type: view.type,
          x: xValue,
          y: yValue,
        };
      } else if (event === "onSelected") {
        params = {
          event,
          data,
          type: view.type,
        };
      }
      params = {
        ...params,
        path,
      };
      triggerPanelEvent(panelId, {
        operator: eventHandlerOperator,
        params,
      });
    }
  };
  const eventHandlers = createPlotlyHandlers(handleEvent);

  const dataDefaults = useMemo(() => {
    return {};
  }, []);
  const layoutDefaults = useMemo(() => {
    return {
      font: {
        family: "var(--fo-fontFamily-body)",
        size: 14,
        color: theme.text.secondary,
      },
      showlegend: false,
      xaxis: {
        showgrid: true,
        zeroline: true,
        visible: true,
        zerolinecolor: theme.text.tertiary,
        color: theme.text.secondary,
        gridcolor: theme.primary.softBorder,
      },
      yaxis: {
        showgrid: true,
        zeroline: true,
        visible: true,
        zerolinecolor: theme.text.tertiary,
        color: theme.text.secondary,
        gridcolor: theme.primary.softBorder,
      },
      autosize: true,
      margin: {
        t: 0,
        l: 0,
        b: 0,
        r: 0,
        pad: 0,
      },
      paper_bgcolor: theme.background.mediaSpace,
      plot_bgcolor: theme.background.mediaSpace,
      legend: {
        x: 1,
        y: 1,
        bgcolor: theme.background.mediaSpace,
        font: { color: theme.text.secondary },
      },
    };
  }, [theme]);
  const configDefaults = useMemo(() => {
    return {
      displaylogo: false,
      scrollZoom: true,
    };
  }, []);

  const mergedLayout = useMemo(() => {
    return merge({}, layoutDefaults, layout);
  }, [layoutDefaults, layout]);

  const mergedConfig = useMemo(() => {
    return merge({}, configDefaults, config);
  }, [configDefaults, config]);
  const mergedData = useMemo(() => {
    return mergeData(data, dataDefaults);
  }, [data, dataDefaults]);

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
  onSelected: (e) => {
    const { event, points } = e || { points: [] };
    const selected = [];
    for (const point of points) {
      const { data, fullData, xaxis, yaxis, ...pointdata } = point;
      const { x, y, z, ids, selectedpoints, ...metadata } = data;
      selected.push({
        idx: point.pointIndex,
        id: Array.isArray(ids) ? ids[point.pointIndex] : null,
      });
    }
    return selected;
  },
};

function getValuesAtIndices(array, indices) {
  if (!indices || !indices) return null;
  return indices.map((i) => array[i]);
}

function mergeData(data, defaults) {
  if (!Array.isArray(data)) {
    data = [data];
  }
  return (data || []).map((trace) => {
    return {
      ...trace,
      ...defaults,
    };
  });
}

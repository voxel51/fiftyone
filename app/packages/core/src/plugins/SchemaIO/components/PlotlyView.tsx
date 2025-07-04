import { useTheme } from "@fiftyone/components/src/components/ThemeProvider";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { Box } from "@mui/material";
import { merge, snakeCase } from "lodash";
import React, { useEffect, useMemo } from "react";
import Plot from "react-plotly.js";
import { HeaderView } from ".";
import { getComponentProps } from "../utils";
import { ViewPropsType } from "../utils/types";

type TraceWithIds = {
  name?: string;
  ids?: string[];
};

function getIdForTrace(
  point: Plotly.Point,
  trace: TraceWithIds,
  options: { is2DArray?: boolean } = {}
) {
  const { is2DArray = false } = options;
  const { data } = point;
  const { x, y, z } = data;
  if (trace?.ids) {
    if (is2DArray) {
      const [xIdx, yIdx] = point.pointIndex;
      return trace.ids[yIdx][xIdx];
    } else {
      return trace.ids[point.pointIndex];
    }
  }
  return null;
}

export default function PlotlyView(props: ViewPropsType) {
  const { data, schema, path, relativeLayout } = props;
  const { view = {} } = schema;
  const { config = {}, layout = {} } = view;
  const theme = useTheme();
  const panelId = usePanelId();
  let range = [0, 0];
  const triggerPanelEvent = usePanelEvent();
  const [revision, setRevision] = React.useState(0);

  const handleEvent = (event?: string) => (e) => {
    const data = EventDataMappers[event]?.(e) || {};
    let xValue = null;
    let yValue = null;
    let zValue = null;
    let value;
    let label;
    let id = null;

    if (event === "onClick") {
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
          xValue = p.x;
          yValue = p.y;
        } else if (type === "bar") {
          xValue = p.x;
          yValue = p.y;
          range = [p.x, p.x + p.width];
        } else if (type === "heatmap") {
          xValue = p.x;
          yValue = p.y;
          zValue = p.z;
        } else if (type === "pie") {
          value = p.v;
          label = p.label;
        }
        id = getIdForTrace(p, fullData, { is2DArray: type === "heatmap" });
      }
      if (selected.length === 0) {
        selected = null;
      }
    }

    const eventHandlerOperator = view[snakeCase(event)];
    const defaultParams = {
      id,
      path: props.path,
      relative_path: props.relativePath,
      schema: props.schema,
      view,
      event,
      value,
      label,
      shift_pressed: Boolean(e?.event?.shiftKey),
    };

    if (eventHandlerOperator) {
      let params = {};
      if (event === "onClick") {
        const eventData = e as Plotly.PlotMouseEvent;
        params = {
          ...defaultParams,
          range,
          x: xValue,
          y: yValue,
          z: zValue,
          idx: e.points[0].pointIndex,
          trace: eventData.points[0].data.name,
          trace_idx: eventData.points[0].curveNumber,
          value,
          label,
        };
      } else if (event === "onSelected") {
        params = {
          ...defaultParams,
          data,
          path,
        };
      } else {
        params = {
          ...defaultParams,
          data,
        };
      }

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
        automargin: true, // Enable automatic margin adjustment
        title: { font: { size: 14, color: theme.text.tertiary } },
      },
      yaxis: {
        showgrid: true,
        zeroline: true,
        visible: true,
        zerolinecolor: theme.text.tertiary,
        color: theme.text.secondary,
        gridcolor: theme.primary.softBorder,
        automargin: true, // Enable automatic margin adjustment
        title: { font: { size: 14, color: theme.text.tertiary } },
      },
      autosize: true,
      margin: {
        t: 20, // Adjust top margin
        l: 50, // Adjust left margin for y-axis labels
        b: 50, // Adjust bottom margin for x-axis labels
        r: 20, // Adjust right margin
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
    return mergeData(data || schema?.view?.data, dataDefaults);
  }, [data, dataDefaults, schema?.view?.data]);

  useEffect(() => {
    setTimeout(() => {
      setRevision((r) => r + 1);
    }, 500); // Delay to allow for layout to be animated
  }, [relativeLayout?.w, relativeLayout?.x, relativeLayout?.COLS]);

  return (
    <Box
      {...getComponentProps(props, "container")}
      sx={{ height: "100%", width: "100%" }}
    >
      <HeaderView {...props} nested />
      <Plot
        revision={revision}
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
      trace: fullData.name,
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
        trace: fullData.name,
        trace_idx: point.curveNumber,
        idx: point.pointIndex,
        id: Array.isArray(ids) ? ids[point.pointIndex] : null,
        x: Array.isArray(x) ? x[point.pointIndex] : null,
        y: Array.isArray(y) ? y[point.pointIndex] : null,
        z: Array.isArray(z) ? z[point.pointIndex] : null,
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

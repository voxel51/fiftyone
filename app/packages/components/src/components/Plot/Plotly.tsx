import { Box, useTheme } from "@mui/material";
import { merge } from "lodash";
import React, { useMemo } from "react";
import Plot, { PlotParams } from "react-plotly.js";
import PlotlyTooltip, { TooltipValue } from "./PlotlyTooltip";

export default function EvaluationPlot(props: EvaluationPlotProps) {
  const { usePlotlyTooltip } = props;

  if (usePlotlyTooltip) {
    return <Plotly {...props} />;
  }

  return <PlotlyWithCustomTooltip {...props} />;
}

function PlotlyWithCustomTooltip(props: EvaluationPlotProps) {
  const [tooltip, setTooltip] =
    React.useState<Readonly<Plotly.PlotHoverEvent>>();
  const { data, tooltip: value } = props;

  const memoizedData = useMemo(() => {
    return data.map((trace) => ({
      ...trace,
      hoverinfo: "none",
      hovertemplate: undefined,
    }));
  }, [data]);

  return (
    <Box sx={{ position: "relative" }}>
      <Plotly
        onHover={(e) => {
          setTooltip(e);
        }}
        onUnhover={(e) => {
          setTooltip(undefined);
        }}
        {...props}
        data={memoizedData as any}
      />
      <PlotlyTooltip event={tooltip} value={value} />
    </Box>
  );
}

function Plotly(props: EvaluationPlotProps) {
  const { layout = {}, data, style = {}, ...otherProps } = props;
  const theme = useTheme();

  const layoutDefaults = useMemo(() => {
    return {
      font: {
        family: "var(--fo-fontFamily-body)",
        size: 14,
        color: theme.palette.text.secondary,
      },
      showlegend: false,
      xaxis: {
        showgrid: true,
        zeroline: true,
        visible: true,
        zerolinecolor: theme.palette.text.tertiary,
        color: theme.palette.text.secondary,
        gridcolor: theme.palette.primary.softBorder,
        automargin: true, // Enable automatic margin adjustment,
        title: { font: { size: 14, color: theme.palette.text.tertiary } },
      },
      yaxis: {
        showgrid: true,
        zeroline: true,
        visible: true,
        zerolinecolor: theme.palette.text.tertiary,
        color: theme.palette.text.secondary,
        gridcolor: theme.palette.primary.softBorder,
        automargin: true, // Enable automatic margin adjustment,
        title: { font: { size: 14, color: theme.palette.text.tertiary } },
      },
      autosize: true,
      margin: { t: 20, l: 50, b: 50, r: 20, pad: 0 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      legend: {
        x: 1,
        y: 1,
        bgcolor: theme.palette.background.paper,
        font: { color: theme.palette.text.secondary },
      },
    };
  }, [theme]);

  const mergedLayout = useMemo(() => {
    return merge({}, layoutDefaults, layout);
  }, [layoutDefaults, layout]);

  const configDefaults: PlotConfig = useMemo(() => {
    return {
      displaylogo: false,
      scrollZoom: false,
      modeBarButtonsToRemove: [
        "autoScale2d",
        "select2d",
        "lasso2d",
        "pan2d",
        "resetScale2d",
        "zoom2d",
        "zoomIn2d",
        "zoomOut2d",
        "toImage",
      ],
    };
  }, []);

  return (
    <Plot
      config={configDefaults}
      layout={mergedLayout}
      style={{ height: "100%", width: "100%", zIndex: 1, ...style }}
      data={data}
      {...otherProps}
    />
  );
}

type PlotConfig = Partial<PlotParams["config"]>;

type EvaluationPlotProps = Omit<PlotParams, "layout" | "style" | "config"> & {
  layout?: Partial<PlotParams["layout"]>;
  style?: React.CSSProperties;
  config?: PlotConfig;
  tooltip?: TooltipValue;
  usePlotlyTooltip?: boolean;
};

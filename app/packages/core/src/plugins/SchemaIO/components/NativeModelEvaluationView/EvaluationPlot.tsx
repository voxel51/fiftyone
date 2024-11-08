import { useTheme } from "@fiftyone/components";
import React, { useMemo } from "react";
import Plot, { PlotParams } from "react-plotly.js";

export default function EvaluationPlot(props: EvaluationPlotProps) {
  const { layout = {}, data, style = {}, ...otherProps } = props;
  const theme = useTheme();

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
      },
      yaxis: {
        showgrid: true,
        zeroline: true,
        visible: true,
        zerolinecolor: theme.text.tertiary,
        color: theme.text.secondary,
        gridcolor: theme.primary.softBorder,
        automargin: true, // Enable automatic margin adjustment
      },
      autosize: true,
      margin: { t: 20, l: 50, b: 50, r: 20, pad: 0 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      legend: {
        x: 1,
        y: 1,
        bgcolor: theme.background.paper,
        font: { color: theme.text.secondary },
      },
    };
  }, [theme]);
  const configDefaults: PlotConfig = useMemo(() => {
    return {
      displaylogo: false,
      scrollZoom: false,
      modeBarButtonsToRemove: [
        "autoScale2d",
        "lasso2d",
        "pan2d",
        "resetScale2d",
        "zoom2d",
        "zoomIn2d",
        "zoomOut2d",
      ],
    };
  }, []);

  return (
    <Plot
      config={configDefaults}
      layout={{ ...layoutDefaults, ...layout }}
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
};

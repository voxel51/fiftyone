import React from "react";
import { Box } from "@mui/material";
import { useTheme } from "@fiftyone/components/src/components/ThemeProvider";
import Plot from "react-plotly.js";
import Header from "./Header";
import { log } from "../utils";

export default function PlotlyView(props) {
  const { data, schema } = props;
  const { default: defaultData, view = {} } = schema;
  const { config = {}, layout = {}, onSelectionChange } = view;
  const theme = useTheme();

  // todo: ...
  function handleSelectionChange(selection) {
    // invoke operator in onSelectionChange
    // onSelectionChange.execute(selection)
  }

  return (
    <Box>
      <Header {...view} />
      <Plot
        data={data || defaultData}
        style={{ zIndex: 1 }}
        onSelected={handleSelectionChange}
        onDeselect={() => handleSelectionChange(null)}
        config={{
          scrollZoom: true,
          displaylogo: false,
          responsive: true,
          displayModeBar: false,
          ...config,
        }}
        layout={{
          dragmode: "lasso",
          uirevision: 1,
          font: { family: "var(--mui-fontFamily-body)", size: 14 },
          showlegend: false,
          width: "100%",
          height: "100%",
          hovermode: false,
          xaxis: { showgrid: true, zeroline: false, visible: false },
          yaxis: {
            showgrid: false,
            zeroline: false,
            visible: false,
            scaleanchor: "x",
            scaleratio: 1,
          },
          autosize: true,
          margin: { t: 0, l: 0, b: 0, r: 0, pad: 0 },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          legend: {
            x: 1,
            y: 1,
            bgcolor: theme.background.level1,
            font: { color: theme.text.secondary },
          },
          ...layout,
        }}
      />
    </Box>
  );
}

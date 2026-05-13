export function trajectoryLayout(): any {
  return {
    autosize: true,
    margin: { l: 36, r: 8, t: 8, b: 32 },
    showlegend: false,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    xaxis: {
      zeroline: false,
      showgrid: true,
      gridcolor: "rgba(120,120,120,0.15)",
      tickfont: { size: 10, color: "rgba(180,180,180,0.85)" },
    },
    yaxis: {
      zeroline: false,
      showgrid: true,
      gridcolor: "rgba(120,120,120,0.15)",
      tickfont: { size: 10, color: "rgba(180,180,180,0.85)" },
      scaleanchor: "x",
      scaleratio: 1,
    },
    hoverlabel: {
      bgcolor: "rgba(20,20,30,0.92)",
      bordercolor: "rgba(70,70,90,0.6)",
      font: { color: "rgba(240,240,240,0.95)", size: 11 },
    },
  };
}

export const trajectoryConfig = {
  displayModeBar: false,
  responsive: true,
  scrollZoom: true,
};

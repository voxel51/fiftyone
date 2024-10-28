export default function formatCtx(ctx) {
  const formattedCtx = ctx;
  for (const oldName in ctxRenames) {
    const newName = ctxRenames[oldName];
    formattedCtx[newName] = ctx[oldName];
  }
  return formattedCtx;
}

const ctxRenames = {
  dataset_name: "datasetName",
  selected: "selectedSamples",
  selected_labels: "selectedLabels",
};

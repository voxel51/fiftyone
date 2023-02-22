import { getFetchFunction } from "@fiftyone/utilities";

export async function fetchUpdatedSelection(params) {
  return getFetchFunction()("POST", "/embeddings/selection", params);
}

export async function fetchExtendedStage(params) {
  return getFetchFunction()("POST", "/embeddings/extended-stage", params);
}

export async function fetchColorByChoices(params) {
  return getFetchFunction()("POST", "/embeddings/color-by-choices", params);
}

export async function fetchPlot({ datasetName, brainKey, view, labelField }) {
  const res = await getFetchFunction()("POST", "/embeddings/plot", {
    datasetName,
    brainKey,
    view,
    labelField,
  });
  return res;
}

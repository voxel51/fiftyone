import { getFetchFunction } from "@fiftyone/utilities";

export async function fetchUpdatedSelection(params) {
  const { dataset, brainKey, view, filters, extended, extendedSelection } =
    params;

  return getFetchFunction()("POST", "/embeddings/selection", params);
}

export async function fetchExtendedStage(params) {
  const { datasetName, view, patchesField, selection } = params;
  return getFetchFunction()("POST", "/embeddings/extended-stage", params);
}

export async function fetchColorByChoices(params) {
  const { datasetName, brainKey } = params;
  return getFetchFunction()("POST", "/embeddings/color-by-choices", params);
}

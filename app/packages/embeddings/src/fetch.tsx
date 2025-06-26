import { getFetchFunction } from "@fiftyone/utilities";

export async function fetchUpdatedSelection(params) {
  return handleErrors(
    await getFetchFunction()("POST", "/embeddings/selection", params)
  );
}

export async function fetchExtendedStage(params) {
  return handleErrors(
    await getFetchFunction()("POST", "/embeddings/extended-stage", params)
  );
}

export async function fetchColorByChoices(params) {
  return handleErrors(
    await getFetchFunction()("POST", "/embeddings/color-by-choices", params)
  );
}

import { NetworkError, ServerError } from "@fiftyone/utilities";

export async function fetchPlot({
  datasetName,
  brainKey,
  view,
  labelField,
  slices,
}) {
  const res = await getFetchFunction()("POST", "/embeddings/plot", {
    datasetName,
    brainKey,
    view,
    labelField,
    slices,
  });
  return res;
}

function handleErrors(res) {
  if (!res || !res.error) {
    return res;
  } else {
    throw new Error(
      res?.error || "Unknown error fetching embeddings plot data."
    );
  }
}

type EmbeddingsServerError = {
  error?: string;
  details?: string;
  stack?: string;
}

function convertNetworkErrorIntoEmbeddingsServerError(error: NetworkError | ServerError): EmbeddingsServerError {
  return {
    error: error.message || "Unknown error occurred.",
    stack: error.stack,
  }
}
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
  return handleErrors(res);
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

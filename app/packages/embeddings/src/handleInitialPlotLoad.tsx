import { getFetchFunction } from "@fiftyone/utilities";

export async function handleInitialPlotLoad({
  datasetName,
  brainKey,
  view,
  labelField,
}) {
  const res = await getFetchFunction()("POST", "/embeddings/plot", {
    datasetName,
    brainKey,
    view,
    labelField,
  });
  return res;
}

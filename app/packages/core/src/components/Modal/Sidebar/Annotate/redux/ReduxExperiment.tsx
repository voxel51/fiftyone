/**
 * Hackday RTK Query experiment.
 *
 * Fetches data via RTK Query and logs it to the console. Renders nothing
 * visible — the existing annotation UI is completely untouched.
 */
import { useCurrentDatasetName, useModalSample } from "@fiftyone/state";
import { useEffect } from "react";
import { Provider } from "react-redux";
import { useGetAppInfoQuery, useGetSampleQuery, useGraphqlQuery } from "./api";
import { annotationStore } from "./store";

function ReduxLogger() {
  const appInfo = useGetAppInfoQuery();

  const datasets = useGraphqlQuery({
    query: `query { datasets(search: "") { edges { node { name } } } }`,
  });

  // Read current context from the existing Recoil state
  const datasetName = useCurrentDatasetName();
  const modalSample = useModalSample();
  const sampleId = modalSample?.sample?._id as string | undefined;

  // Debug: log what we're getting from Recoil
  useEffect(() => {
    console.log("[RTK hackday] Context from Recoil:", {
      datasetName,
      sampleId,
      hasSample: !!modalSample,
      sampleKeys: modalSample?.sample ? Object.keys(modalSample.sample) : null,
    });
  }, [datasetName, sampleId, modalSample]);

  // Fetch the same sample via RTK Query (independent of Relay)
  const sample = useGetSampleQuery(
    datasetName && sampleId ? { dataset: datasetName, sampleId } : undefined!,
    { skip: !datasetName || !sampleId }
  );

  useEffect(() => {
    if (appInfo.data) {
      console.log("[RTK hackday] App info:", appInfo.data);
    }
  }, [appInfo.data]);

  useEffect(() => {
    if (datasets.data) {
      console.log("[RTK hackday] Datasets:", datasets.data);
    }
  }, [datasets.data]);

  useEffect(() => {
    if (sample.data) {
      console.log("[RTK hackday] Sample (via RTK Query):", sample.data);

      // Extract label fields from the sample JSON
      if (sample.data.sample) {
        const labels = Object.fromEntries(
          Object.entries(sample.data.sample).filter(
            ([_key, value]) => value?._cls
          )
        );

        console.log("[RTK hackday] Labels:", labels);
      }
    }

    if (sample.error) {
      console.warn("[RTK hackday] Sample error:", sample.error);
    }
  }, [sample.data, sample.error]);

  return null;
}

export default function ReduxExperiment() {
  return (
    <Provider store={annotationStore}>
      <ReduxLogger />
    </Provider>
  );
}

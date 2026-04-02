/**
 * Hackday RTK Query experiment.
 *
 * RTK Query logger — no more Jotai bridge.
 * Redux is now the source of truth for annotation state.
 */
import { useCurrentDatasetName, useModalSample } from "@fiftyone/state";
import { useEffect } from "react";
import { useGetAppInfoQuery, useGetSampleQuery, useGraphqlQuery } from "./api";

function ReduxLogger() {
  const appInfo = useGetAppInfoQuery();

  const datasets = useGraphqlQuery({
    query: `query { datasets(search: "") { edges { node { name } } } }`,
  });

  const datasetName = useCurrentDatasetName();
  const modalSample = useModalSample();
  const sampleId = modalSample?.sample?._id as string | undefined;

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
  return <ReduxLogger />;
}

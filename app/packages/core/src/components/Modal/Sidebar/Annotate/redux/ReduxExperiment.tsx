/**
 * Hackday RTK Query experiment.
 *
 * Fetches data via RTK Query and logs it to the console. Renders nothing
 * visible — the existing annotation UI is completely untouched.
 */
import { useEffect } from "react";
import { Provider } from "react-redux";
import { annotationStore } from "./store";
import { useGetAppInfoQuery, useGraphqlQuery } from "./api";

function ReduxLogger() {
  const appInfo = useGetAppInfoQuery();

  const datasets = useGraphqlQuery({
    query: `query { datasets(search: "") { edges { node { name } } } }`,
  });

  useEffect(() => {
    if (appInfo.data) {
      console.log("[RTK hackday] App info:", appInfo.data);
    }
    if (appInfo.error) {
      console.warn("[RTK hackday] App info error:", appInfo.error);
    }
  }, [appInfo.data, appInfo.error]);

  useEffect(() => {
    if (datasets.data) {
      console.log("[RTK hackday] Datasets:", datasets.data);
    }
    if (datasets.error) {
      console.warn("[RTK hackday] Datasets error:", datasets.error);
    }
  }, [datasets.data, datasets.error]);

  return null;
}

export default function ReduxExperiment() {
  return (
    <Provider store={annotationStore}>
      <ReduxLogger />
    </Provider>
  );
}

import {
  getRoutingContext,
  Loading,
  RelayEnvironment,
  RouteData,
  RouteRenderer,
  withErrorBoundary,
  withRouter,
  withTheme,
} from "@fiftyone/components";
import {
  darkTheme,
  getEventSource,
  setFetchFunction,
} from "@fiftyone/utilities";
import React, { Suspense, useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { atom, RecoilRoot } from "recoil";

import Setup from "./components/Setup";

import { useScreenshot } from "./utils/hooks";

import "./index.css";
import routes from "./routes";
import { RelayEnvironmentProvider } from "react-relay";
import { DatasetQuery } from "./Root/Datasets/__generated__/DatasetQuery.graphql";

enum AppReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

setFetchFunction(import.meta.env.VITE_API || window.location.origin);

const getDatasetName = () => {
  const context = getRoutingContext();
  const match = context
    .get()
    .entries.filter(
      (entry) =>
        entry.routeData.isExact && entry.routeData.path === "/datasets/:name"
    )[0];

  if (match) {
    const data = match.routeData as RouteData<DatasetQuery>;
    return data.params.name;
  }

  return null;
};

const App = withErrorBoundary(
  withRouter(
    withTheme(() => {
      const [readyState, setReadyState] = useState(AppReadyState.CONNECTING);

      useEffect(() => {
        const controller = new AbortController();
        const dataset = getDatasetName();

        getEventSource(
          "/state",
          {
            onopen: async (response) => {
              setReadyState(AppReadyState.OPEN);
            },
            onclose: () => {
              setReadyState(AppReadyState.CLOSED);
            },
          },
          controller.signal,
          {
            dataset,
          }
        );

        return () => controller.abort();
      }, []);

      useScreenshot();

      return (
        <>
          {readyState < 2 ? (
            <Suspense fallback={<Loading>Pixelating...</Loading>}>
              <RouteRenderer router={getRoutingContext()} />
            </Suspense>
          ) : (
            <Setup />
          )}
        </>
      );
    }, atom({ key: "theme", default: darkTheme })),
    routes
  )
);

const Root = withErrorBoundary(() => {
  return (
    <RecoilRoot>
      <RelayEnvironmentProvider environment={RelayEnvironment}>
        <App />
      </RelayEnvironmentProvider>
    </RecoilRoot>
  );
});

const root = document.getElementById("root") as HTMLDivElement;

ReactDOM.render(<Root />, root);

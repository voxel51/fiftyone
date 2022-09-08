/**
 * Copyright 2017-2022, Voxel51, Inc.
 */
import { Loading, Theme } from "@fiftyone/components";
import {
  Dataset as CoreDataset,
  useDatasetLoader,
  usePreLoadedDataset,
  ViewBar,
} from "@fiftyone/core";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { darkTheme, getEventSource, toCamelCase } from "@fiftyone/utilities";
import { useEffect, useState, Suspense } from "react";
import { State } from "@fiftyone/state";
import { usePlugins } from "@fiftyone/plugins";

enum Events {
  STATE_UPDATE = "state_update",
}

export function Dataset({ datasetName, environment, theme }) {
  theme = theme || darkTheme;

  const [initialState, setInitialState] = useState();
  const [datasetQueryRef, loadDataset] = useDatasetLoader(environment);

  useEffect(() => {
    loadDataset("quickstart-geo");
  }, [environment]);
  const subscription = useRecoilValue(fos.stateSubscription);
  useEventSource(datasetName, subscription, setInitialState);
  const plugins = usePlugins();
  const loadingElement = <Loading>Pixelating...</Loading>;

  if (plugins.isLoading || !initialState) return loadingElement;
  if (plugins.error) return <div>Plugin error...</div>;

  console.log({ initialState });

  return (
    <Theme theme={theme}>
      <Suspense fallback={loadingElement}>
        <DatasetLoader
          datasetQueryRef={datasetQueryRef}
          initialState={initialState}
        >
          <ViewBar />
          <CoreDataset />
        </DatasetLoader>
      </Suspense>
    </Theme>
  );
}

function DatasetLoader({ datasetQueryRef, children, initialState }) {
  const [dataset, ready] =
    datasetQueryRef && usePreLoadedDataset(datasetQueryRef, initialState);

  if (!dataset) {
    return <h4>Dataset not found!</h4>;
  }
  if (!ready) return null;

  return children;
}

function useEventSource(datasetName, subscription, setState) {
  useEffect(() => {
    const controller = new AbortController();
    getEventSource(
      "/events",
      {
        onopen: async () => {},
        onmessage: (msg) => {
          if (controller.signal.aborted) {
            return;
          }

          switch (msg.event) {
            case Events.STATE_UPDATE: {
              const { colorscale, config, ...data } = JSON.parse(
                msg.data
              ).state;

              const state = {
                ...toCamelCase(data),
                view: data.view,
              } as State.Description;

              console.log({ colorscale, config, state });

              setState((s) => ({ colorscale, config, state }));

              break;
            }
          }
        },
        onclose: () => {
          // clearModal();
        },
      },
      controller.signal,
      {
        initializer: datasetName,
        subscription,
        events: [Events.STATE_UPDATE],
      }
    );

    return () => controller.abort();
  }, []);
}

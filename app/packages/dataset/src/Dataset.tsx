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
import styled from "styled-components";

// built-in plugins
import "@fiftyone/map";
import "@fiftyone/looker-3d";

enum Events {
  STATE_UPDATE = "state_update",
}

export function Dataset({ datasetName, environment, theme }) {
  theme = theme || darkTheme;

  const [initialState, setInitialState] = useState();
  const [datasetQueryRef, loadDataset] = useDatasetLoader(environment);

  useEffect(() => {
    loadDataset(datasetName);
  }, [environment]);
  const subscription = useRecoilValue(fos.stateSubscription);
  useEventSource(datasetName, subscription, setInitialState);
  const plugins = usePlugins();
  const loadingElement = <Loading>Pixelating...</Loading>;

  if (plugins.isLoading || !initialState) return loadingElement;
  if (plugins.error) return <div>Plugin error...</div>;

  const Container = styled.div`
    width: 100%;
    height: 100%;
    background: var(--background-dark);
    margin: 0;
    padding: 0;
    font-family: "Palanquin", sans-serif;
    font-size: 14px;

    color: var(--font);
    display: flex;
    flex-direction: column;
    min-width: 660px;
  `;

  return (
    <Theme theme={theme}>
      <Container>
        <Suspense fallback={loadingElement}>
          <DatasetLoader
            datasetQueryRef={datasetQueryRef}
            initialState={initialState}
          >
            <ViewBar />
            <CoreDataset />
          </DatasetLoader>
        </Suspense>
        <div id="modal" />
      </Container>
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
  const clearModal = fos.useClearModal();
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

              setState((s) => ({ colorscale, config, state }));

              break;
            }
          }
        },
        onclose: () => {
          clearModal();
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

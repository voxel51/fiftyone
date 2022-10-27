/**
 * Copyright 2017-2022, Voxel51, Inc.
 */
import {
  IconButton,
  KeyboardArrowDown,
  KeyboardArrowUp,
  Loading,
  ThemeProvider,
} from "@fiftyone/components";
import {
  Dataset as CoreDataset,
  useDatasetLoader,
  usePreLoadedDataset,
  ViewBar,
} from "@fiftyone/core";
import { useRecoilValue, useSetRecoilState } from "recoil";
import * as fos from "@fiftyone/state";
import { getEventSource, toCamelCase } from "@fiftyone/utilities";
import { useEffect, useState, Suspense } from "react";
import { State } from "@fiftyone/state";

import { usePlugins } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { State } from "@fiftyone/state";
import { getEventSource, toCamelCase } from "@fiftyone/utilities";
import { Suspense, useEffect, useState } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";

// built-in plugins
import "@fiftyone/looker-3d";
import "@fiftyone/map";

enum Events {
  STATE_UPDATE = "state_update",
}

const Container = styled.div`
  width: 100%;
  height: 100%;
  background: var(--joy-palette-background-level2);
  margin: 0;
  padding: 0;
  font-family: "Palanquin", sans-serif;
  font-size: 14px;

  color: var(--joy-palette-text-primary);
  display: flex;
  flex-direction: column;
  min-width: 660px;
  & * {
    font-family: var(--joy-fontFamily-body);
  }
`;
const ViewBarWrapper = styled.div`
  padding: 16px;
  background: var(--joy-palette-background-header);
  display: flex;
`;

export function Dataset({
  datasetName,
  environment,
  theme,
  themeMode,
  compactLayout,
  toggleHeaders,
  hideHeaders,
  readOnly,
}) {
  const [initialState, setInitialState] = useState();
  const [datasetQueryRef, loadDataset] = useDatasetLoader(environment);
  const setThemeMode = useSetRecoilState(fos.theme);
  const setCompactLayout = useSetRecoilState(fos.compactLayout);
  const setReadOnly = useSetRecoilState(fos.readOnly);

  useEffect(() => {
    setReadOnly(readOnly);
    loadDataset(datasetName);
    if (themeMode) setThemeMode(themeMode);
    if (compactLayout) setCompactLayout(themeMode);
  }, [datasetName, themeMode, compactLayout, readOnly]);

  const subscription = useRecoilValue(fos.stateSubscription);
  useEventSource(datasetName, subscription, setInitialState);
  const plugins = usePlugins();
  const loadingElement = <Loading>Pixelating...</Loading>;

  if (plugins.isLoading || !initialState) return loadingElement;
  if (plugins.error) return <div>Plugin error...</div>;

  const themeProviderProps = theme ? { customTheme: theme } : {};

  return (
    <ThemeProvider {...themeProviderProps}>
      <Container>
        <Suspense fallback={loadingElement}>
          <DatasetLoader
            datasetQueryRef={datasetQueryRef}
            initialState={initialState}
          >
            <ViewBarWrapper>
              <ViewBar />
              {toggleHeaders && (
                <HeadersToggle
                  toggleHeaders={toggleHeaders}
                  hideHeaders={hideHeaders}
                />
              )}
            </ViewBarWrapper>
            <CoreDataset />
          </DatasetLoader>
        </Suspense>
        <div id="modal" />
      </Container>
    </ThemeProvider>
  );
}

function HeadersToggle({ toggleHeaders, hideHeaders }) {
  return (
    <IconButton
      title={`${hideHeaders ? "Show" : "Hide"} headers`}
      onClick={() => {
        toggleHeaders();
      }}
      disableRipple
      sx={{ color: (theme) => theme.palette.text.secondary }}
    >
      {hideHeaders && <KeyboardArrowDown />}
      {!hideHeaders && <KeyboardArrowUp />}
    </IconButton>
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

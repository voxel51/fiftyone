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
  DatasetNodeQuery,
  usePreLoadedDataset,
  ViewBar,
} from "@fiftyone/core";
import { usePlugins } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { getEventSource, toCamelCase } from "@fiftyone/utilities";
import { getEnvironment, RelayEnvironmentKey, State } from "@fiftyone/state";
import React, { useEffect, useState, Suspense } from "react";
import { PreloadedQuery, useQueryLoader, usePreloadedQuery } from "react-relay";
import { RecoilRoot, useRecoilValue, useSetRecoilState } from "recoil";
import { RecoilRelayEnvironmentProvider } from "recoil-relay";
import styled from "styled-components";

import { DatasetQuery, DatasetQuery$data } from "@fiftyone/core";

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
`;
const ViewBarWrapper = styled.div`
  padding: 16px;
  background: var(--joy-palette-background-header);
  display: flex;
`;
const CoreDatasetContainer = styled.div`
  height: calc(100% - 84px);
`;

export interface DatasetProps {
  dataset: string;
  compactLayout?: boolean;
  hideHeaders?: boolean;
  readOnly?: boolean;
  theme?: "dark" | "light";
  toggleHeaders?: () => void;
}

export const Dataset: React.FC<DatasetProps> = (props) => {
  const [environment] = useState(getEnvironment);
  return (
    <RecoilRoot>
      <RecoilRelayEnvironmentProvider
        environment={environment}
        environmentKey={RelayEnvironmentKey}
      >
        <DatasetRenderer {...props} />
      </RecoilRelayEnvironmentProvider>
    </RecoilRoot>
  );
};

export const DatasetRenderer: React.FC<DatasetProps> = ({
  dataset,
  compactLayout = true,
  hideHeaders = false,
  readOnly = false,
  theme = "dark",
  toggleHeaders,
}) => {
  const [queryRef, loadQuery] = useQueryLoader<DatasetQuery>(DatasetNodeQuery);
  const setTheme = useSetRecoilState(fos.theme);
  const setCompactLayout = useSetRecoilState(fos.compactLayout);
  const setReadOnly = useSetRecoilState(fos.readOnly);

  React.useLayoutEffect(() => {
    setCompactLayout(compactLayout);
  }, [compactLayout]);
  React.useEffect(() => {
    console.log(dataset);
    loadQuery({ name: dataset });
  }, [dataset]);
  React.useLayoutEffect(() => {
    setReadOnly(readOnly);
  }, [readOnly]);
  React.useLayoutEffect(() => {
    setTheme(theme);
  }, [theme]);

  const plugins = usePlugins();
  const loadingElement = <Loading>Pixelating...</Loading>;

  if (plugins.isLoading || !queryRef) return loadingElement;
  if (plugins.hasError) return <div>Plugin error...</div>;

  return (
    <ThemeProvider>
      <Container>
        <Suspense fallback={loadingElement}>
          <DatasetLoader dataset={dataset} queryRef={queryRef}>
            <ViewBarWrapper>
              <ViewBar />
              {toggleHeaders && (
                <HeadersToggle
                  toggleHeaders={toggleHeaders}
                  hideHeaders={hideHeaders}
                />
              )}
            </ViewBarWrapper>
            <CoreDatasetContainer>
              <CoreDataset />
            </CoreDatasetContainer>
          </DatasetLoader>
        </Suspense>
        <div id="modal" />
      </Container>
    </ThemeProvider>
  );
};

const HeadersToggle: React.FC<{
  hideHeaders: boolean;
  toggleHeaders: () => void;
}> = ({ toggleHeaders, hideHeaders }) => {
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
};

const DatasetLoader: React.FC<
  React.PropsWithChildren<{
    dataset: string;
    queryRef: PreloadedQuery<DatasetQuery>;
  }>
> = ({ children, dataset, queryRef }) => {
  const [data, ready] = usePreLoadedDataset(queryRef);
  const datasetData = useRecoilValue(fos.dataset);

  if (!data) {
    return <h4>Dataset not found!</h4>;
  }

  if (dataset !== datasetData?.name) {
    return null;
  }

  if (!ready) return null;

  return <>{children}</>;
};

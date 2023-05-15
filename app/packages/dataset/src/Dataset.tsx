/**
 * Copyright 2017-2023, Voxel51, Inc.
 */
import {
  IconButton,
  KeyboardArrowDown,
  KeyboardArrowUp,
  Loading,
} from "@fiftyone/components";
import {
  Dataset as CoreDataset,
  DatasetNodeQuery,
  DatasetQuery,
  DatasetQueryRef,
  usePreLoadedDataset,
  ViewBar,
} from "@fiftyone/core";
import { usePlugins } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import React, { Suspense, useContext, useEffect, useState } from "react";
import { PreloadedQuery, useQueryLoader, usePreloadedQuery } from "react-relay";
import { RecoilRoot, useRecoilValue, useSetRecoilState } from "recoil";
import { RecoilRelayEnvironmentProvider } from "recoil-relay";
import styled from "styled-components";
import { OperatorCore } from "@fiftyone/operators";

// built-in plugins
import "@fiftyone/looker-3d";
import "@fiftyone/map";
import "@fiftyone/embeddings";

const Container = styled.div`
  width: 100%;
  height: 100%;
  background: var(--fo-palette-background-level2);
  margin: 0;
  padding: 0;
  font-family: "Palanquin", sans-serif;
  font-size: 14px;
  color: var(--fo-palette-text-primary);
  display: flex;
  flex-direction: column;
  min-width: 660px;
`;
const ViewBarWrapper = styled.div`
  padding: 16px;
  background: var(--fo-palette-background-header);
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
  canEditSavedViews?: boolean;
  canEditCustomColors?: boolean;
}

export const Dataset: React.FC<DatasetProps> = ({
  dataset,
  compactLayout = true,
  hideHeaders = false,
  readOnly = false,
  theme = "dark",
  toggleHeaders,
  canEditSavedViews = true,
  canEditCustomColors = true,
}) => {
  const [queryRef, loadQuery] = useQueryLoader<DatasetQuery>(DatasetNodeQuery);
  const setTheme = useSetRecoilState(fos.theme);
  const setCanChangeSavedViews = useSetRecoilState(fos.canEditSavedViews);
  const setCanChangeCustomColors = useSetRecoilState(fos.canEditCustomColors);
  const setCompactLayout = useSetRecoilState(fos.compactLayout);
  const setReadOnly = useSetRecoilState(fos.readOnly);

  React.useLayoutEffect(() => {
    setCompactLayout(compactLayout);
  }, [compactLayout]);
  React.useLayoutEffect(() => {
    setReadOnly(readOnly);
  }, [readOnly]);
  React.useLayoutEffect(() => {
    setTheme(theme);
  }, [theme]);

  const context = useContext(fos.RouterContext);
  const savedViewSlug = React.useMemo(
    () => fos.getSavedViewName(context),
    [context]
  );
  React.useEffect(() => {
    loadQuery({ name: dataset, savedViewSlug: savedViewSlug });
  }, [dataset, savedViewSlug]);
  React.useEffect(() => {
    setCanChangeSavedViews(canEditSavedViews);
  }, [canEditSavedViews]);
  React.useEffect(() => {
    setCanChangeCustomColors(canEditCustomColors);
  }, [canEditCustomColors]);

  const plugins = usePlugins();
  const loadingElement = <Loading>Pixelating...</Loading>;

  if (plugins.isLoading || !queryRef) return loadingElement;
  if (plugins.hasError) return <div>Plugin error...</div>;

  return (
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
          <Suspense fallback={loadingElement}>
            <CoreDatasetContainer>
              <CoreDataset />
            </CoreDatasetContainer>
          </Suspense>
        </DatasetLoader>
      </Suspense>
      <div id="modal" />
      <div id="colorModal" />
      <OperatorCore />
    </Container>
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
  const query = usePreloadedQuery<DatasetQuery>(DatasetNodeQuery, queryRef);

  if (!data) {
    return <h4>Dataset not found!</h4>;
  }

  if (dataset !== datasetData?.name) {
    return null;
  }

  if (!ready) return null;

  return (
    <DatasetQueryRef.Provider value={query}>
      {children}
    </DatasetQueryRef.Provider>
  );
};

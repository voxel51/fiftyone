/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useTrackEvent } from "@fiftyone/analytics";
import {
  DiscordLink,
  DocsLink,
  GitHubLink,
  Header,
  IconButton,
  iconContainer,
} from "@fiftyone/components";
import { ViewBar } from "@fiftyone/core";
import { OperatorPlacements, types } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { useRefresh } from "@fiftyone/state";
import { DarkMode, LightMode } from "@mui/icons-material";
import { Box, useColorScheme } from "@mui/material";
import React, { Suspense, useMemo } from "react";
import { useFragment, usePaginationFragment } from "react-relay";
import { useDebounce } from "react-use";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { graphql } from "relay-runtime";
import Analytics from "./Analytics";
import DatasetSelector from "./DatasetSelector";
import Teams from "./Teams";
import type { NavDatasets$key } from "./__generated__/NavDatasets.graphql";
import type { NavFragment$key } from "./__generated__/NavFragment.graphql";

const getUseSearch = (fragment: NavDatasets$key) => {
  return (search: string) => {
    const refresh = useRecoilValue(fos.refresher);
    const { data, refetch } = usePaginationFragment(
      graphql`
        fragment NavDatasets on Query
        @refetchable(queryName: "DatasetsPaginationQuery") {
          datasets(search: $search, first: $count, after: $cursor)
            @connection(key: "DatasetsList_query_datasets") {
            total
            edges {
              cursor
              node {
                name
              }
            }
          }
        }
      `,
      fragment
    );

    useDebounce(
      () => {
        refetch({ search });
      },
      200,
      [search, refresh]
    );

    return useMemo(() => {
      return {
        total: data.datasets.total === null ? undefined : data.datasets.total,
        values: data.datasets.edges.map((edge) => edge.node.name),
      };
    }, [data]);
  };
};

const Nav: React.FC<
  React.PropsWithChildren<{
    fragment: NavFragment$key;
    hasDataset: boolean;
  }>
> = ({ children, fragment, hasDataset }) => {
  const data = useFragment(
    graphql`
      fragment NavFragment on Query {
        ...Analytics
        ...NavDatasets
      }
    `,
    fragment
  );

  const useSearch = getUseSearch(data);
  const refresh = useRefresh();
  const { mode, setMode } = useColorScheme();
  const setTheme = useSetRecoilState(fos.theme);
  const trackEvent = useTrackEvent();

  return (
    <>
      <Header
        title={"FiftyOne"}
        onRefresh={refresh}
        navChildren={<DatasetSelector useSearch={useSearch} />}
      >
        {hasDataset && (
          <Suspense fallback={<div style={{ flex: 1 }} />}>
            <ViewBar />
          </Suspense>
        )}
        {!hasDataset && <div style={{ flex: 1 }} />}
        <div style={{ padding: '0.5rem' }}>
          <Teams />
        </div>
        <div className={iconContainer}>
          <IconButton
            title={mode === "dark" ? "Light mode" : "Dark mode"}
            onClick={() => {
              const nextMode = mode === "dark" ? "light" : "dark";
              setMode(nextMode);
              setTheme(nextMode);
              trackEvent("switch_app_theme", { theme: nextMode });
            }}
            sx={{
              color: (theme) => theme.palette.text.secondary,
              m: 0,
              p: "0.5rem",
            }}
          >
            {mode === "dark" ? <LightMode color="inherit" /> : <DarkMode />}
          </IconButton>
          <DiscordLink />
          <GitHubLink />
          <DocsLink />
          <Box ml={1}> 
            <OperatorPlacements place={types.Places.HEADER_ACTIONS} />
          </Box>
        </div>
      </Header>
      {children}
      <Analytics fragment={data} />
    </>
  );
};

export default Nav;

/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useTrackEvent } from "@fiftyone/analytics";
import {
  DiscordLink,
  DocsLink,
  GitHubLink,
  Header,
  iconContainer,
} from "@fiftyone/components";
import { OperatorPlacements, types } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { useRefresh } from "@fiftyone/state";
import { ViewBar } from "@fiftyone/view-bar";
import { Icon, IconName, Size } from "@voxel51/voodo";
import React, { Suspense, useCallback, useMemo } from "react";
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
      fragment,
    );

    useDebounce(
      () => {
        refetch({ search });
      },
      200,
      [search, refresh],
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
    fragment,
  );

  const useSearch = getUseSearch(data);
  const refresh = useRefresh();
  // Theme mode comes from the recoil `fos.theme` atom — same atom
  // MUI's `useColorScheme` was being shadowed onto, just read
  // directly so we don't pull MUI into the Nav.
  const mode = useRecoilValue(fos.theme);
  const setTheme = useSetRecoilState(fos.theme);
  const trackEvent = useTrackEvent();
  const toggleTheme = useCallback(() => {
    const nextMode = mode === "dark" ? "light" : "dark";
    setTheme(nextMode);
    trackEvent("switch_app_theme", { theme: nextMode });
  }, [mode, setTheme, trackEvent]);

  return (
    <>
      <Header
        title={"FiftyOne"}
        onRefresh={refresh}
        navChildren={<DatasetSelector useSearch={useSearch} />}
      >
        {hasDataset && (
          <Suspense
            fallback={<div style={{ flex: 1, marginLeft: "1.5rem" }} />}
          >
            {/* Explicit `marginLeft` here as a belt-and-suspenders
                gap — the header's flex `gap` should already separate
                the dataset selector from the bar, but a few
                experiments showed the gap collapsing in some
                browser/zoom combinations. The hard margin guarantees
                visible separation. `flex: 1` lets the bar absorb
                the remaining horizontal space. */}
            <div style={{ flex: 1, marginLeft: "1.5rem", minWidth: 0 }}>
              <ViewBar />
            </div>
          </Suspense>
        )}
        {!hasDataset && <div style={{ flex: 1, marginLeft: "1.5rem" }} />}
        <div style={{ padding: "0.5rem" }}>
          <Teams />
        </div>
        <div className={iconContainer}>
          <div
            title={mode === "dark" ? "Light mode" : "Dark mode"}
            onClick={toggleTheme}
            style={{
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              padding: "0.5rem",
              color: "var(--fo-palette-text-secondary)",
            }}
          >
            <Icon
              name={mode === "dark" ? IconName.Sun : IconName.Moon}
              size={Size.Lg}
            />
          </div>
          <DiscordLink />
          <GitHubLink />
          <DocsLink />
          <div style={{ marginLeft: "0.5rem" }}>
            <OperatorPlacements place={types.Places.HEADER_ACTIONS} />
          </div>
        </div>
      </Header>
      {children}
      <Analytics fragment={data} />
    </>
  );
};

export default Nav;

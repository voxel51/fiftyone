/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useTrackEvent } from "@fiftyone/analytics";
import { SavedQueriesMenu } from "@fiftyone/core";
import { OperatorPlacements, types } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { useSetDataset } from "@fiftyone/state";
import { ViewBar } from "@fiftyone/view-bar";
import { useColorScheme } from "@mui/material";
import { Align, Orientation, Spacing, Stack } from "@voxel51/voodo";
import React, { Suspense, useCallback, useMemo } from "react";
import { useFragment, usePaginationFragment } from "react-relay";
import { useDebounce } from "react-use";
import { useReverbValue, useSetReverbState } from "@fiftyone/reverb";
import { graphql } from "relay-runtime";
import { useProduct } from "../product";
import Analytics from "./Analytics";
import DatasetMenu from "./DatasetMenu";
import DatasetSelector from "./DatasetSelector";
import Header from "./Header";
import ScopeCrumb from "./ScopeCrumb";
import HelpMenu from "./HelpMenu";
import styles from "./Nav.module.css";
import Teams from "./Teams";
import type { NavDatasets$key } from "./__generated__/NavDatasets.graphql";
import type { NavFragment$key } from "./__generated__/NavFragment.graphql";

const getUseSearch = (fragment: NavDatasets$key) => {
  return (search: string) => {
    const refresh = useReverbValue(fos.refresher);
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
    hidden?: boolean;
  }>
> = ({ children, fragment, hasDataset, hidden }) => {
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
  const setDataset = useSetDataset();
  // Two theme owners, both of which must hear a toggle: MUI's color scheme
  // paints the `--fo-palette-*` variables everything is styled with, and the
  // store atom is what the rest of the app reads. Setting only the atom
  // leaves the palette stale until a reload re-derives the mode.
  const { mode, setMode } = useColorScheme();
  const setTheme = useSetReverbState(fos.theme);
  const trackEvent = useTrackEvent();
  const { enterpriseCta, HeaderActions, Status, title } = useProduct();
  const toggleTheme = useCallback(() => {
    const nextMode = mode === "dark" ? "light" : "dark";
    setMode(nextMode);
    setTheme(nextMode);
    trackEvent("switch_app_theme", { theme: nextMode });
  }, [mode, setMode, setTheme, trackEvent]);

  return (
    <>
      <Header
        title={hasDataset ? undefined : title}
        hidden={hidden}
        onHome={() => setDataset(null)}
        crumbs={[
          <DatasetSelector
            key="dataset"
            useSearch={useSearch}
            hidden={hidden}
          />,
          ...(hasDataset ? [<ScopeCrumb key="scope" />] : []),
        ]}
        belowRow={
          hasDataset && (
            <Suspense fallback={null}>
              <ViewBar savedQueries={<SavedQueriesMenu hidden={hidden} />} />
            </Suspense>
          )
        }
      >
        {Status && <Status />}
        <Stack
          orientation={Orientation.Row}
          align={Align.Center}
          spacing={Spacing.Sm}
          className={styles.actions}
        >
          {HeaderActions ? (
            <HeaderActions />
          ) : (
            enterpriseCta && <Teams disablePopover={hidden} />
          )}
          <OperatorPlacements place={types.Places.HEADER_ACTIONS} />
          {/* Remounted as the header hides, so no menu stays open over the
              sample page */}
          <React.Fragment key={hidden ? "hidden" : "shown"}>
            {hasDataset && <DatasetMenu />}
            <HelpMenu
              theme={mode === "dark" ? "dark" : "light"}
              onToggleTheme={toggleTheme}
            />
          </React.Fragment>
        </Stack>
      </Header>
      {children}
      <Analytics fragment={data} />
    </>
  );
};

export default Nav;

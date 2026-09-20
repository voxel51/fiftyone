/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Header } from "@fiftyone/components";
import { OperatorPlacements, types } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { useRefresh } from "@fiftyone/state";
import { ViewBar } from "@fiftyone/view-bar";
import { Align, Orientation, Spacing, Stack } from "@voxel51/voodo";
import React, { Suspense, useMemo } from "react";
import { useFragment, usePaginationFragment } from "react-relay";
import { useDebounce } from "react-use";
import { useRecoilValue } from "recoil";
import { graphql } from "relay-runtime";
import Analytics from "./Analytics";
import DatasetSelector from "./DatasetSelector";
import HeaderLinks from "./HeaderLinks";
import styles from "./Nav.module.css";
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

  return (
    <>
      <Header
        title={"FiftyOne"}
        onRefresh={refresh}
        navChildren={<DatasetSelector useSearch={useSearch} />}
      >
        {hasDataset ? (
          <Suspense fallback={<div className={styles.spacer} />}>
            <div className={styles.bar}>
              <ViewBar />
            </div>
          </Suspense>
        ) : (
          <div className={styles.spacer} />
        )}
        <Stack
          orientation={Orientation.Row}
          align={Align.Center}
          spacing={Spacing.Sm}
          className={styles.actions}
        >
          <Teams />
          <HeaderLinks />
          <OperatorPlacements place={types.Places.HEADER_ACTIONS} />
        </Stack>
      </Header>
      {children}
      <Analytics fragment={data} />
    </>
  );
};

export default Nav;

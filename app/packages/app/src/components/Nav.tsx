/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useTrackEvent } from "@fiftyone/analytics";
import { Header } from "@fiftyone/components";
import { OperatorPlacements, types } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { useRefresh } from "@fiftyone/state";
import { ViewBar } from "@fiftyone/view-bar";
import { useColorScheme } from "@mui/material";
import {
  Align,
  Button,
  DarkModeIcon,
  DiscordIcon,
  GitHubIcon,
  LightModeIcon,
  MenuBookIcon,
  Orientation,
  Size,
  Spacing,
  Stack,
  Variant,
} from "@voxel51/voodo";
import React, { Suspense, useCallback, useMemo } from "react";
import { useFragment, usePaginationFragment } from "react-relay";
import { useDebounce } from "react-use";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { graphql } from "relay-runtime";
import Analytics from "./Analytics";
import DatasetSelector from "./DatasetSelector";
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
  // Two theme owners, both of which must hear a toggle: MUI's color scheme
  // paints the `--fo-palette-*` variables everything is styled with, and the
  // recoil atom is what the rest of the app reads. Setting only the atom
  // leaves the palette stale until a reload re-derives the mode.
  const { mode, setMode } = useColorScheme();
  const setTheme = useSetRecoilState(fos.theme);
  const trackEvent = useTrackEvent();
  const toggleTheme = useCallback(() => {
    const nextMode = mode === "dark" ? "light" : "dark";
    setMode(nextMode);
    setTheme(nextMode);
    trackEvent("switch_app_theme", { theme: nextMode });
  }, [mode, setMode, setTheme, trackEvent]);

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
        >
          <Teams />
          <Button
            variant={Variant.Icon}
            size={Size.Md}
            borderless
            leadingIcon={mode === "dark" ? LightModeIcon : DarkModeIcon}
            title={mode === "dark" ? "Light mode" : "Dark mode"}
            aria-label={mode === "dark" ? "Light mode" : "Dark mode"}
            onClick={toggleTheme}
          />
          <Button
            variant={Variant.Icon}
            size={Size.Md}
            borderless
            leadingIcon={DiscordIcon}
            href="https://community.voxel51.com/"
            target="_blank"
            title="Discord"
            aria-label="Discord"
          />
          <Button
            variant={Variant.Icon}
            size={Size.Md}
            borderless
            leadingIcon={GitHubIcon}
            href="https://github.com/voxel51/fiftyone"
            target="_blank"
            title="GitHub"
            aria-label="GitHub"
          />
          <Button
            variant={Variant.Icon}
            size={Size.Md}
            borderless
            leadingIcon={MenuBookIcon}
            href="https://docs.voxel51.com/user_guide/app.html"
            target="_blank"
            title="Documentation"
            aria-label="Documentation"
          />
          <OperatorPlacements place={types.Places.HEADER_ACTIONS} />
        </Stack>
      </Header>
      {children}
      <Analytics fragment={data} />
    </>
  );
};

export default Nav;

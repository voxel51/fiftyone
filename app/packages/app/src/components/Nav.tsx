/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useTrackEvent } from "@fiftyone/analytics";
import { AppHeader, HeaderLogo, useFocusMode } from "@fiftyone/app-header";
import { SavedQueriesMenu, ScopeCrumb } from "@fiftyone/core";
import { OperatorPlacements, types } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { useRefresh } from "@fiftyone/state";
import { ViewBar } from "@fiftyone/view-bar";
import { useColorScheme } from "@mui/material";
import {
  Button,
  DarkModeIcon,
  LightModeIcon,
  Size,
  Variant,
} from "@voxel51/voodo";
import React, { Suspense, useCallback, useMemo } from "react";
import { useFragment, usePaginationFragment } from "react-relay";
import { useDebounce } from "react-use";
import { useReverbValue, useSetReverbState } from "@fiftyone/reverb";
import { graphql } from "relay-runtime";
import { useProduct } from "../product";
import Analytics from "./Analytics";
import DatasetSelector from "./DatasetSelector";
import logo from "../images/logo.png";
import HeaderLinks from "./HeaderLinks";
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
  const refresh = useRefresh();
  // Two theme owners, both of which must hear a toggle: MUI's color scheme
  // paints the `--fo-palette-*` variables everything is styled with, and the
  // store atom is what the rest of the app reads. Setting only the atom
  // leaves the palette stale until a reload re-derives the mode.
  const { mode, setMode } = useColorScheme();
  const setTheme = useSetReverbState(fos.theme);
  const trackEvent = useTrackEvent();
  const { enterpriseCta, HeaderActions, Status, title } = useProduct();
  // Page state that outlives a trip to the sample page, whose own "F" it
  // leaves alone
  const focus = useFocusMode(hasDataset && !hidden);
  const focused = hasDataset && focus.focused;
  const toggleTheme = useCallback(() => {
    const nextMode = mode === "dark" ? "light" : "dark";
    setMode(nextMode);
    setTheme(nextMode);
    trackEvent("switch_app_theme", { theme: nextMode });
  }, [mode, setMode, setTheme, trackEvent]);

  return (
    <>
      <AppHeader
        logo={
          <HeaderLogo
            src={logo}
            label="Refresh"
            onClick={refresh}
            data-cy="refresh-fo"
          />
        }
        title={hasDataset ? undefined : title}
        hidden={hidden}
        focus={hasDataset ? focus : undefined}
        crumbs={[
          <DatasetSelector
            key="dataset"
            useSearch={useSearch}
            hidden={hidden}
          />,
          ...(hasDataset ? [<ScopeCrumb key="scope" />] : []),
        ]}
        center={Status && <Status />}
        actions={
          <>
            {HeaderActions ? (
              <HeaderActions />
            ) : (
              enterpriseCta && <Teams disablePopover={hidden} />
            )}
            <OperatorPlacements place={types.Places.HEADER_ACTIONS} />
          </>
        }
        utilities={
          <>
            <Button
              variant={Variant.Icon}
              size={Size.Md}
              borderless
              leadingIcon={mode === "dark" ? LightModeIcon : DarkModeIcon}
              title={mode === "dark" ? "Light mode" : "Dark mode"}
              aria-label={mode === "dark" ? "Light mode" : "Dark mode"}
              onClick={toggleTheme}
            />
            <HeaderLinks />
          </>
        }
        belowRow={
          hasDataset && (
            <Suspense fallback={null}>
              <ViewBar
                compact={focused}
                savedQueries={<SavedQueriesMenu hidden={hidden} />}
              />
            </Suspense>
          )
        }
      />
      {children}
      <Analytics fragment={data} />
    </>
  );
};

export default Nav;

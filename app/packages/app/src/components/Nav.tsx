import {
  DocsLink,
  GitHubLink,
  Header,
  IconButton,
  SlackLink,
  Tooltip,
  iconContainer,
} from "@fiftyone/components";
import { ViewBar } from "@fiftyone/core";
import * as fos from "@fiftyone/state";
import { useRefresh } from "@fiftyone/state";
import { isElectron } from "@fiftyone/utilities";
import { DarkMode, LightMode, Lock } from "@mui/icons-material";
import { useColorScheme } from "@mui/material";
import React, { Suspense, useEffect, useMemo } from "react";
import ReactGA from "react-ga4";
import { useFragment, usePaginationFragment } from "react-relay";
import { useDebounce } from "react-use";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { graphql } from "relay-runtime";
import gaConfig from "../ga";
import DatasetSelector from "./DatasetSelector";
import { NavDatasets$key } from "./__generated__/NavDatasets.graphql";
import { NavFragment$key } from "./__generated__/NavFragment.graphql";
import { NavGA$key } from "./__generated__/NavGA.graphql";

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

export const useGA = (fragment: NavGA$key) => {
  const info = useFragment(
    graphql`
      fragment NavGA on Query {
        context
        dev
        doNotTrack
        uid
        version
      }
    `,
    fragment
  );

  useEffect(() => {
    if (info.doNotTrack) {
      return;
    }

    const dev = info.dev;
    const buildType = dev ? "dev" : "prod";
    ReactGA.initialize(gaConfig.app_ids[buildType], {
      testMode: false,
      gaOptions: {
        storage: "none",
        cookieDomain: "none",
        clientId: info.uid,
        page_location: "omitted",
        page_path: "omitted",
        kind: isElectron() ? "Desktop" : "Web",
        version: info.version,
        context: info.context,
        checkProtocolTask: null, // disable check, allow file:// URLs
      },
    });
  }, [info]);
};

const Nav: React.FC<{
  fragment: NavFragment$key;
  hasDataset: boolean;
}> = ({ fragment, hasDataset }) => {
  const data = useFragment(
    graphql`
      fragment NavFragment on Query {
        ...NavDatasets
        ...NavGA
      }
    `,
    fragment
  );
  useGA(data);
  const useSearch = getUseSearch(data);
  const refresh = useRefresh();
  const { mode, setMode } = useColorScheme();
  const setTheme = useSetRecoilState(fos.theme);
  const datasetHead = useRecoilValue(fos.datasetHeadName);
  const datasetSnapshot = useRecoilValue(fos.datasetSnapshotName);

  return (
    <>
      <Header
        title={"FiftyOne Teams"}
        onRefresh={refresh}
        navChildren={<DatasetSelector useSearch={useSearch} />}
      >
        {datasetHead && datasetSnapshot && (
          <div
            style={{
              alignItems: "center",
              display: "flex",
              height: "100%",
              marginRight: "1rem",
            }}
          >
            <Tooltip
              text={
                `You are viewing the snapshot "${datasetSnapshot}" of the` +
                ` dataset "${datasetHead}" (Read-only mode)`
              }
              placement="bottom-center"
            >
              <Lock
                sx={{ color: (theme) => theme.palette.primary.main, mt: 1 }}
              />
            </Tooltip>
          </div>
        )}
        {hasDataset && (
          <Suspense fallback={<div style={{ flex: 1 }}></div>}>
            <ViewBar />
          </Suspense>
        )}
        {!hasDataset && <div style={{ flex: 1 }}></div>}
        <div className={iconContainer}>
          <IconButton
            title={mode === "dark" ? "Light mode" : "Dark mode"}
            onClick={() => {
              const nextMode = mode === "dark" ? "light" : "dark";
              setMode(nextMode);
              setTheme(nextMode);
            }}
            sx={{
              color: (theme) => theme.palette.text.secondary,
              pr: 0,
            }}
          >
            {mode === "dark" ? <LightMode color="inherit" /> : <DarkMode />}
          </IconButton>
          <SlackLink />
          <GitHubLink />
          <DocsLink />
        </div>
      </Header>
    </>
  );
};

export default Nav;

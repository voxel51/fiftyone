import {
  Button,
  DocsLink,
  GitHubLink,
  Header,
  IconButton,
  SlackLink,
  iconContainer,
} from "@fiftyone/components";
import { ViewBar } from "@fiftyone/core";
import * as fos from "@fiftyone/state";
import { useRefresh } from "@fiftyone/state";
import { isElectron } from "@fiftyone/utilities";
import { DarkMode, LightMode } from "@mui/icons-material";
import { useColorScheme } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { default as React, Suspense, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import ReactGA from "react-ga";
import { useFragment, usePaginationFragment } from "react-relay";
import { useDebounce } from "react-use";
import { useRecoilState, useRecoilValue } from "recoil";
import { graphql } from "relay-runtime";
import ga from "../ga";
import DatasetSelector from "./DatasetSelector";
import Teams from "./Teams";
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

    ReactGA.initialize(ga.app_ids[buildType], {
      debug: false,
      gaOptions: {
        storage: "none",
        cookieDomain: "none",
        clientId: info.uid,
      },
    });
    ReactGA.set({
      userId: info.uid,
      checkProtocolTask: null, // disable check, allow file:// URLs
      [ga.dimensions.dev]: buildType,
      [ga.dimensions.version]: `${info.version}`,
      [ga.dimensions.context]: info.context + (isElectron() ? "-DESKTOP" : ""),
    });
    ReactGA.pageview("/");
  }, []);
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

        teamsSubmission
      }
    `,
    fragment
  );
  useGA(data);
  const useSearch = getUseSearch(data);

  const [teams, setTeams] = useRecoilState(fos.appTeamsIsOpen);
  const refresh = useRefresh();
  const { mode, setMode } = useColorScheme();
  const [_, setTheme] = useRecoilState(fos.theme);

  return (
    <>
      <Header
        title={"FiftyOne"}
        onRefresh={refresh}
        navChildren={<DatasetSelector useSearch={useSearch} />}
      >
        {hasDataset && (
          <Suspense fallback={<div style={{ flex: 1 }}></div>}>
            <ViewBar />
          </Suspense>
        )}
        {!hasDataset && <div style={{ flex: 1 }}></div>}
        <div className={iconContainer}>
          {!data.teamsSubmission && (
            <Button
              onClick={() => {
                setTeams(true);
              }}
            >
              Have a Team?
            </Button>
          )}
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
      {ReactDOM.createPortal(
        <AnimatePresence>
          {teams && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{
                opacity: 1,
                height: "auto",
              }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              key={"teams"}
            >
              <Teams />
            </motion.div>
          )}
        </AnimatePresence>,
        document.getElementById("teams") as HTMLDivElement
      )}
    </>
  );
};

export default Nav;

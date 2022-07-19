import React, { Suspense, useContext, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import ReactGA from "react-ga";
import { motion, AnimatePresence } from "framer-motion";
import {
  PreloadedQuery,
  useFragment,
  usePaginationFragment,
  usePreloadedQuery,
} from "react-relay";
import { useDebounce } from "react-use";
import { useRecoilState, useRecoilValue } from "recoil";
import { graphql } from "relay-runtime";

import {
  Button,
  DocsLink,
  GitHubLink,
  Header,
  SlackLink,
  iconContainer,
  Route,
  Link,
} from "@fiftyone/components";

import gaConfig from "../ga";
import style from "./Root.module.css";
import ViewBar from "../components/ViewBar/ViewBar";
import Teams from "../components/Teams/Teams";

import { RootQuery } from "./__generated__/RootQuery.graphql";
import { RootConfig_query$key } from "./__generated__/RootConfig_query.graphql";
import { RootDatasets_query$key } from "./__generated__/RootDatasets_query.graphql";
import { RootGA_query$key } from "./__generated__/RootGA_query.graphql";
import { RootNav_query$key } from "./__generated__/RootNav_query.graphql";
import { clone, isElectron } from "@fiftyone/utilities";
import { RGB } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { getDatasetName, RouterContext } from "@fiftyone/state";

const rootQuery = graphql`
  query RootQuery($search: String = "", $count: Int, $cursor: String) {
    ...RootConfig_query
    ...RootDatasets_query
    ...RootGA_query
    ...RootNav_query
  }
`;

const getUseSearch = (prepared: PreloadedQuery<RootQuery>) => {
  const refresh = useRecoilValue(fos.refresher);

  return (search: string) => {
    const query = usePreloadedQuery<RootQuery>(rootQuery, prepared);

    const { data, refetch } = usePaginationFragment(
      graphql`
        fragment RootDatasets_query on Query
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
      query as RootDatasets_query$key
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
        total: data.datasets.total,
        values: data.datasets.edges.map((edge) => edge.node.name),
      };
    }, [data]);
  };
};

const DatasetLink: React.FC<{ value: string; className: string }> = ({
  className,
  value,
}) => {
  return (
    <Link title={value} className={className}>
      {value}
    </Link>
  );
};

export const useGA = (prepared: PreloadedQuery<RootQuery>) => {
  const query = usePreloadedQuery<RootQuery>(rootQuery, prepared);

  const info = useFragment(
    graphql`
      fragment RootGA_query on Query {
        context
        dev
        doNotTrack
        uid
        version
      }
    `,
    query as RootGA_query$key
  );

  useEffect(() => {
    if (info.doNotTrack) {
      return;
    }
    const dev = info.dev;
    const buildType = dev ? "dev" : "prod";

    ReactGA.initialize(gaConfig.app_ids[buildType], {
      debug: dev,
      gaOptions: {
        storage: "none",
        cookieDomain: "none",
        clientId: info.uid,
      },
    });
    ReactGA.set({
      userId: info.uid,
      checkProtocolTask: null, // disable check, allow file:// URLs
      [gaConfig.dimensions.dev]: buildType,
      [gaConfig.dimensions.version]: `${info.version}`,
      [gaConfig.dimensions.context]:
        info.context + (isElectron() ? "-DESKTOP" : ""),
    });
    ReactGA.pageview("/");
  }, []);
};

const Nav: React.FC<{ prepared: PreloadedQuery<RootQuery> }> = ({
  prepared,
}) => {
  useGA(prepared);
  const useSearch = getUseSearch(prepared);
  const query = usePreloadedQuery<RootQuery>(rootQuery, prepared);

  const { teamsSubmission } = useFragment(
    graphql`
      fragment RootNav_query on Query {
        teamsSubmission
      }
    `,
    query as RootNav_query$key
  );
  const [teams, setTeams] = useRecoilState(fos.appTeamsIsOpen);
  const refresh = fos.useRefresh();
  const setDataset = fos.useSetDataset();
  const context = useContext(RouterContext);
  const dataset = getDatasetName(context);

  return (
    <>
      <Header
        title={"FiftyOne"}
        onRefresh={() => {
          refresh();
        }}
        datasetSelectorProps={{
          component: DatasetLink,
          onSelect: (name) => {
            name !== dataset && setDataset(name);
          },
          placeholder: "Select dataset",
          useSearch,
          value: dataset || "",
        }}
      >
        {dataset && <ViewBar />}
        {!dataset && <div style={{ flex: 1 }}></div>}
        <div className={iconContainer}>
          {!teamsSubmission && (
            <Button
              onClick={() => {
                setTeams(true);
              }}
            >
              Have a Team?
            </Button>
          )}
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
        document.getElementById("teams")
      )}
    </>
  );
};

const Root: Route<RootQuery> = ({ children, prepared }) => {
  const query = usePreloadedQuery<RootQuery>(rootQuery, prepared);
  const data = useFragment(
    graphql`
      fragment RootConfig_query on Query {
        config {
          colorBy
          colorPool
          colorscale
          gridZoom
          loopVideos
          notebookHeight
          showConfidence
          showIndex
          showLabel
          showSkeletons
          showTooltip
          timezone
          useFrameNumber
        }
        colorscale
      }
    `,
    query as RootConfig_query$key
  );

  const update = fos.useStateUpdate();
  useEffect(() => {
    update({
      colorscale: clone(data.colorscale) as RGB[],
      config: clone(data.config),
    });
  }, [data]);

  return (
    <>
      <Nav prepared={prepared} />
      <div className={style.page}>
        <Suspense fallback={null}>{children}</Suspense>
      </div>
    </>
  );
};

export default Root;

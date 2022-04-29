import React, { Suspense, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import ReactGA from "react-ga";
import { motion, AnimatePresence } from "framer-motion";
import {
  PreloadedQuery,
  useFragment,
  useMutation,
  usePaginationFragment,
  usePreloadedQuery,
} from "react-relay";
import { useDebounce } from "react-use";
import {
  useRecoilRefresher_UNSTABLE,
  useRecoilState,
  useRecoilValue,
} from "recoil";
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
  useTo,
} from "@fiftyone/components";

import gaConfig from "../ga";
import style from "./Root.module.css";
import { datasetName, refresher, stateSubscription } from "../recoil/selectors";
import ViewBar from "../components/ViewBar/ViewBar";
import { appTeamsIsOpen } from "../recoil/atoms";
import Teams from "../components/Teams/Teams";

import { RootQuery } from "./__generated__/RootQuery.graphql";
import { RootDatasets_query$key } from "./__generated__/RootDatasets_query.graphql";
import { RootGA_query$key } from "./__generated__/RootGA_query.graphql";
import { RootNav_query$key } from "./__generated__/RootNav_query.graphql";
import { RootSetDatasetMutation } from "./__generated__/RootSetDatasetMutation.graphql";
import { useHashChangeHandler } from "../utils/hooks";
import { isElectron } from "@fiftyone/utilities";

const rootQuery = graphql`
  query RootQuery($search: String = "", $count: Int = 10, $cursor: String) {
    ...RootNav_query
    ...RootDatasets_query
  }
`;

const getUseSearch = (prepared: PreloadedQuery<RootQuery>) => {
  const refresh = useRecoilValue(refresher);

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
    <Link title={value} className={className} to={`/datasets/${value}`}>
      {value}
    </Link>
  );
};

export const useGA = ({
  prepared,
}: {
  prepared: PreloadedQuery<RootQuery>;
}) => {
  const [gaInitialized, setGAInitialized] = useState(false);
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
        info.context + isElectron() ? "-desktop" : "",
    });
    setGAInitialized(true);
    ReactGA.pageview(window.location.pathname + window.location.search);
  }, []);
  useHashChangeHandler(() => {
    if (info.doNotTrack) {
      return;
    }
    if (gaInitialized) {
      ReactGA.pageview(window.location.pathname + window.location.search);
    }
  });
};

const Nav: React.FC<{ prepared: PreloadedQuery<RootQuery> }> = ({
  prepared,
}) => {
  const dataset = useRecoilValue(datasetName);
  const useSearch = getUseSearch(prepared);
  const fns = useTo();
  const query = usePreloadedQuery<RootQuery>(rootQuery, prepared);

  const { teamsSubmission } = useFragment(
    graphql`
      fragment RootNav_query on Query {
        teamsSubmission
      }
    `,
    query as RootNav_query$key
  );

  const [commit] = useMutation<RootSetDatasetMutation>(graphql`
    mutation RootSetDatasetMutation($subscription: String!, $name: String) {
      setDataset(subscription: $subscription, name: $name)
    }
  `);
  const subscription = useRecoilValue(stateSubscription);
  const [teams, setTeams] = useRecoilState(appTeamsIsOpen);
  const refresh = useRecoilRefresher_UNSTABLE(refresher);

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
            commit({
              variables: {
                name: name,
                subscription,
              },
            });
            fns.start(name);
            fns.to(name);
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

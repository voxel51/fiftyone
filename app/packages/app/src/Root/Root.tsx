import React, { Suspense, useMemo } from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  PreloadedQuery,
  useMutation,
  usePaginationFragment,
  usePreloadedQuery,
  useQueryLoader,
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

import style from "./Root.module.css";
import {
  datasetName,
  refresher,
  showTeamsButton,
  stateSubscription,
} from "../recoil/selectors";
import ViewBar from "../components/ViewBar/ViewBar";
import { appTeamsIsOpen } from "../recoil/atoms";
import Teams from "../components/Teams/Teams";

import { RootQuery } from "./__generated__/RootQuery.graphql";
import { RootDatasets_query$key } from "./__generated__/RootDatasets_query.graphql";
import { RootSetDatasetMutation } from "./__generated__/RootSetDatasetMutation.graphql";

const getUseSearch = (prepared: PreloadedQuery<RootQuery>) => {
  const refresh = useRecoilValue(refresher);

  return (search: string) => {
    const query = usePreloadedQuery<RootQuery>(
      graphql`
        query RootQuery(
          $search: String = ""
          $count: Int = 10
          $cursor: String
        ) {
          ...RootDatasets_query
        }
      `,
      prepared
    );

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

const Nav: React.FC<{ prepared: PreloadedQuery<RootQuery> }> = ({
  prepared,
}) => {
  const dataset = useRecoilValue(datasetName);
  const useSearch = getUseSearch(prepared);
  const fns = useTo();
  const showTeams = useRecoilValue(showTeamsButton);
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
          {showTeams !== "hidden" && (
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

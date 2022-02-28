import React, { Suspense } from "react";
import { usePaginationFragment, usePreloadedQuery } from "react-relay";
import { useDebounce } from "react-use";
import { useRecoilValue } from "recoil";
import { graphql } from "relay-runtime";

import ViewBar from "@fiftyone/app/src/components/ViewBar/ViewBar";
import {
  DocsLink,
  GitHubLink,
  Header,
  SlackLink,
  iconContainer,
  Route,
  Link,
  useTo,
} from "@fiftyone/components";

import { RootDatasets_query$key } from "./__generated__/RootDatasets_query.graphql";
import { RootQuery } from "./__generated__/RootQuery.graphql";

import style from "./Root.module.css";
import { datasetName } from "@fiftyone/app/src/recoil/selectors";
import { useMemo } from "react";
import { getRoutingContext } from "@fiftyone/components/src/with/RelayEnvironment";

const getUseSearch = (datasets: RootDatasets_query$key) => {
  return (search: string) => {
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
      datasets
    );

    useDebounce(
      () => {
        refetch({ search });
      },
      200,
      [search]
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

const Nav: React.FC<{
  datasets: RootDatasets_query$key;
}> = (props) => {
  const dataset = useRecoilValue(datasetName);
  const useSearch = getUseSearch(props.datasets);
  const fns = useTo(getRoutingContext());

  return (
    <Header
      title={"FiftyOne Teams"}
      onRefresh={() => {}}
      datasetSelectorProps={{
        component: DatasetLink,
        onSelect: (value) => {
          fns.start(value);
          fns.query(value);
          fns.to(value);
        },
        placeholder: "Select dataset",
        useSearch,
        value: dataset || "",
      }}
    >
      {dataset && <ViewBar />}
      {!dataset && <div style={{ flex: 1 }}></div>}
      <div className={iconContainer}>
        <SlackLink />
        <GitHubLink />
        <DocsLink />
      </div>
    </Header>
  );
};

const Root: Route<RootQuery> = ({ children, prepared }) => {
  const data = usePreloadedQuery(
    graphql`
      query RootQuery($search: String = "", $count: Int = 10, $cursor: String) {
        ...RootDatasets_query
      }
    `,
    prepared
  );
  return (
    <>
      <Nav datasets={data} />
      <div className={style.page}>
        <Suspense fallback={null}>{children}</Suspense>
      </div>
    </>
  );
};

export default Root;

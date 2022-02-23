import React, { Suspense, useState } from "react";
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
} from "@fiftyone/components";

import Logo from "../images/logo.png";
import { RouteComponent } from "../routing";

import { RootDatasets_query$key } from "./__generated__/RootDatasets_query.graphql";
import { RootQuery } from "./__generated__/RootQuery.graphql";

import style from "./Root.module.css";
import { useTo } from "../routing/RoutingContext";
import { datasetName } from "@fiftyone/app/src/recoil/selectors";
import Link from "../routing/Link";
import { useMemo } from "react";

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
  const fns = useTo();

  return (
    <Header
      title={"FiftyOne Teams"}
      logo={Logo}
      onRefresh={() => {}}
      placeholder={"Select dataset"}
      value={dataset || ""}
      useSearch={useSearch}
      component={DatasetLink}
      onSelect={(value) => {
        fns.start(value);
        fns.query(value);
        fns.to(value);
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

const Root: RouteComponent<RootQuery> = ({ children, prepared }) => {
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

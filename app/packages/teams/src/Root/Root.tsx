import React, { Suspense } from "react";
import { usePaginationFragment, usePreloadedQuery } from "react-relay";
import { graphql } from "relay-runtime";

import { Header, Selector } from "@fiftyone/components";

import Logo from "../images/logo.png";
import { RouteComponent } from "../routing";

import { RootDatasets_query$key } from "./__generated__/RootDatasets_query.graphql";
import { RootQuery } from "./__generated__/RootQuery.graphql";

import style from "./Root.module.css";
import { useTo } from "../routing/RoutingContext";

interface Entry {
  to: string;
  name: string;
  icon: JSX.Element;
}

const DatasetListingComponent: React.FC<{
  datasets: RootDatasets_query$key;
}> = (props) => {
  const { data, refetch } = usePaginationFragment(
    graphql`
      fragment RootDatasets_query on Query
        @refetchable(queryName: "DatasetsPaginationQuery") {
        datasets(first: $count, after: $cursor)
          @connection(key: "DatasetsList_query_datasets") {
          edges {
            cursor
            node {
              name
            }
          }
        }
      }
    `,
    props.datasets
  );

  return (
    <div>
      {data.datasets.edges.map((edge) => {
        if (edge == null || edge.node == null) {
          return null;
        }
        return edge.node.name;
      })}
    </div>
  );
};

const Root: RouteComponent<RootQuery> = ({ children, prepared }) => {
  const {
    viewer: { id },
  } = usePreloadedQuery(
    graphql`
      query RootQuery($count: Int = 10, $cursor: String) {
        ...RootDatasets_query
        viewer {
          id
        }
      }
    `,
    prepared
  );

  const to = useTo();

  return (
    <>
      <Header title={"FiftyOne Teams"} logo={Logo} onRefresh={() => {}}>
        <Selector
          placeholder={"Select dataset"}
          values={[]}
          value={null}
          onSelect={(dataset) => to(`/dataset/${dataset}`)}
        />
      </Header>
      <div className={style.container}>
        <div className={style.page}>
          <Suspense fallback={null}>{children}</Suspense>
        </div>
      </div>
    </>
  );
};

export default Root;

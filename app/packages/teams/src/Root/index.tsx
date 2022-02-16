import { useAuth0 } from "@auth0/auth0-react";
import { State } from "@fiftyone/app/src/recoil/types";
import { useStateUpdate } from "@fiftyone/app/src/utils/hooks";
import { clone } from "@fiftyone/utilities";
import React, { Suspense, useEffect } from "react";
import { AiOutlineDatabase, AiOutlineUser } from "react-icons/ai";
import {
  useFragment,
  usePaginationFragment,
  usePreloadedQuery,
} from "react-relay";
import { useRecoilValue } from "recoil";
import { graphql } from "relay-runtime";

import Logo from "../images/logo.png";
import { RouteComponent } from "../routing";

import { RootDatasets_query$key } from "./__generated__/RootDatasets_query.graphql";
import { RootQuery } from "./__generated__/RootQuery.graphql";

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

const Header = () => {};

const Root: RouteComponent<RootQuery> = ({ children, prepared }) => {
  const {
    viewer: { id },
  } = usePreloadedQuery(
    graphql`
      query RootQuery {
        ...RootDatasets_query
        viewer {
          id
        }
      }
    `,
    prepared
  );

  const state: State.Description = {
    view: [],
    selected: [],
    selectedLabels: [],
    close: false,
    refresh: false,
    connected: true,
    viewCls: null,
    datasets: data.datasets.edges.map(({ node }) => node.name),
    config: {
      ...clone(data.viewer.config),
    },
    activeHandle: null,
    colorscale: clone(data.viewer.colorscale) || [],
  };

  const update = useStateUpdate();

  useEffect(() => {
    update({ state });
  }, [state]);

  return (
    <div className={container}>
      <div className={page}>
        <Suspense fallback={null}>{children}</Suspense>
      </div>
    </div>
  );
};

export default Root;

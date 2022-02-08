import React from "react";
import { useCallback } from "react";
import { createPaginationContainer, graphql } from "react-relay";

import { RouteComponent } from "../../routing";

const DatasetFeed: React.FC = ({ relay }) => {
  const loadMore = useCallback(() => {
    if (!relay.hasMore() || relay.isLoading()) {
      return;
    }

    relay.loadMore(10, (error) => {
      console.log(error);
    });
  }, []);

  return (
    <div>
      {datasets.edges.map((edge) => (
        <div key={edge.node.id}>{edge.node.name}</div>
      ))}
      <button onPress={() => this._loadMore()} title="Load More" />
    </div>
  );
};

const DatasetContainer = createPaginationContainer(
  DatasetFeed,
  {
    user: graphql`
      fragment Feed_dataset on Dataset
        @argumentDefinitions(
          count: { type: "Int", defaultValue: 10 }
          cursor: { type: "ID" }
        ) {
        datasets(first: $count, after: $cursor) @connection(key: "Feed_feed") {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `,
  },
  {
    direction: "forward",
    getConnectionFromProps(props) {
      return props.user && props.user.feed;
    },
    getFragmentVariables(prevVars, totalCount) {
      return {
        ...prevVars,
        count: totalCount,
      };
    },
    getVariables(props, { count, cursor }) {
      return {
        count,
        cursor,
      };
    },
    query: graphql`
      # Pagination query to be fetched upon calling 'loadMore'.
      # Notice that we re-use our fragment, and the shape of this query matches our fragment spec.
      query DatasetPaginationQuery($count: Int!, $cursor: ID) {
        datasets: node(id: $datasetID) {
          ...Feed_user
            @arguments(count: $count, cursor: $cursor, orderBy: $orderBy)
        }
      }
    `,
  }
);

const Home: RouteComponent = ({ prepared }) => {
  return <DatasetContainer />;
};

export default Home;

import React from "react";
import { graphql, usePaginationFragment, usePreloadedQuery } from "react-relay";

import { RouteComponent } from "../../routing";

const HomeComponent = (props) => {
  const {
    data,
    loadNext,
    loadPrevious,
    hasNext,
    hasPrevious,
    isLoadingNext,
    isLoadingPrevious,
    refetch,
  } = usePaginationFragment(
    graphql`
      fragment HomeComponent_query on Query
        @refetchable(queryName: "DatasetsPaginationQuery") {
        datasets(first: $count, after: $cursor)
          @connection(key: "DatasetList_query_datasets") {
          edges {
            node {
              name
            }
          }
        }
      }
    `,
    props.user
  );

  return (
    <>
      <div>homepage</div>
    </>
  );
};

const Home: RouteComponent = ({ prepared }) => {
  const data = usePreloadedQuery(
    graphql`
      query HomeQuery($count: Int = 10, $cursor: String) {
        ...HomeComponent_query
      }
    `,
    prepared
  );

  return <HomeComponent user={data} />;
};

export default Home;

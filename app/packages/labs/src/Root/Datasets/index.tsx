import React from "react";
import { graphql, usePaginationFragment, usePreloadedQuery } from "react-relay";

import { RouteComponent } from "../../routing";

const Dataset = () => {};

const DatasetListingComponent = (props) => {
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
      fragment DatasetListingComponent_query on Query
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

const DatasetsComponent: RouteComponent = ({ prepared }) => {
  const data = usePreloadedQuery(
    graphql`
      query DatasetsQuery($count: Int = 10, $cursor: String) {
        ...DatasetListingComponent_query
      }
    `,
    prepared
  );

  return <DatasetListingComponent user={data} />;
};

export default DatasetsComponent;

import React, { useCallback } from "react";
import {
  graphql,
  useFragment,
  usePaginationFragment,
  usePreloadedQuery,
} from "react-relay";

import { RouteComponent } from "../../routing";
import { DatasetsListingCard_dataset$key } from "./__generated__/DatasetsListingCard_dataset.graphql";
import { DatasetsListingComponent_query$key } from "./__generated__/DatasetsListingComponent_query.graphql";
import { DatasetsQuery } from "./__generated__/DatasetsQuery.graphql";

const DatasetCard: React.FC<{ dataset: DatasetsListingCard_dataset$key }> = (
  props
) => {
  const { name, id } = useFragment(
    graphql`
      fragment DatasetsListingCard_dataset on Dataset {
        id
        name
      }
    `,
    props.dataset
  );
  return (
    <div>
      <span>{name}</span>
      {id}
    </div>
  );
};

const DatasetListingComponent: React.FC<{
  datasets: DatasetsListingComponent_query$key;
}> = (props) => {
  const { data, loadNext, hasNext, isLoadingNext } = usePaginationFragment(
    graphql`
      fragment DatasetsListingComponent_query on Query
        @refetchable(queryName: "DatasetsPaginationQuery") {
        datasets(first: $count, after: $cursor)
          @connection(key: "DatasetsList_query_datasets") {
          edges {
            cursor
            node {
              ...DatasetsListingCard_dataset
            }
          }
        }
      }
    `,
    props.datasets
  );

  const loadMore = useCallback(() => {
    if (isLoadingNext) {
      return;
    }
    loadNext(10);
  }, [isLoadingNext, loadNext]);

  return (
    <div className="issues">
      {data.datasets.edges.map((edge) => {
        if (edge == null || edge.node == null) {
          return null;
        }
        return <DatasetCard dataset={edge.node} key={edge.cursor} />;
      })}
      {hasNext && <button onClick={loadMore}>Load More</button>}
    </div>
  );
};

const DatasetsComponent: RouteComponent<DatasetsQuery> = ({ prepared }) => {
  const data = usePreloadedQuery(
    graphql`
      query DatasetsQuery($count: Int = 10, $cursor: String) {
        ...DatasetsListingComponent_query
      }
    `,
    prepared
  );
  console.log("HELLO");

  return <DatasetListingComponent datasets={data} />;
};

export default DatasetsComponent;

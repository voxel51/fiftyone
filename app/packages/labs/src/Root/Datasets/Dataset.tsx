import React from "react";
import { graphql, usePreloadedQuery } from "react-relay";

import { RouteComponent } from "../../routing";
import { DatasetQuery } from "./__generated__/DatasetQuery.graphql";

const Dataset: RouteComponent<DatasetQuery> = ({ prepared }) => {
  const data = usePreloadedQuery(
    graphql`
      query DatasetQuery($name: String!) {
        dataset(name: $name) {
          id
          name
        }
      }
    `,
    prepared
  );
  return <div>{data.dataset.name}</div>;
};

export default Dataset;

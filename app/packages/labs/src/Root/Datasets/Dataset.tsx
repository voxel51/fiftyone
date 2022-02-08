import React from "react";
import { graphql, usePreloadedQuery } from "react-relay";

import { RouteComponent } from "../../routing";

const Dataset: RouteComponent = ({ prepared }) => {
  const data = usePreloadedQuery(
    graphql`
      query DatasetQuery($name: String!) {
        dataset
      }
    `,
    prepared
  );
  return <div>dataset page</div>;
};

export default Dataset;

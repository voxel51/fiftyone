import React from "react";
import { graphql, usePreloadedQuery } from "react-relay";

import { Loading } from "@fiftyone/components";

import { RouteComponent } from "../../routing";
import { HomeQuery } from "./__generated__/HomeQuery.graphql";

const Home: RouteComponent<HomeQuery> = ({ prepared }) => {
  const data = usePreloadedQuery(
    graphql`
      query HomeQuery {
        viewer {
          givenName
        }
      }
    `,
    prepared
  );

  return <Loading>No dataset selected</Loading>;
};

export default Home;

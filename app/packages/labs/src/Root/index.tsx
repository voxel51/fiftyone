import React from "react";
import { usePreloadedQuery } from "react-relay";
import { graphql } from "relay-runtime";

import { RouteComponent } from "../routing";

const Root: RouteComponent = ({ children, prepared }) => {
  const data = usePreloadedQuery(
    graphql`
      query RootQuery {
        viewer {
          id
        }
      }
    `,
    prepared
  );

  return (
    <>
      <div></div>
      <div>{children}</div>
    </>
  );
};

export default Root;

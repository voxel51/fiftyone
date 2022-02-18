import React, { useEffect } from "react";
import { graphql, usePreloadedQuery } from "react-relay";
import { useResetRecoilState } from "recoil";

import { Loading } from "@fiftyone/components";

import { RouteComponent } from "../../routing";
import { HomeQuery } from "./__generated__/HomeQuery.graphql";
import { stateDescription } from "@fiftyone/app/src/recoil/atoms";

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
  const reset = useResetRecoilState(stateDescription);

  useEffect(() => {
    reset();
  }, []);

  return <Loading>No dataset selected</Loading>;
};

export default Home;

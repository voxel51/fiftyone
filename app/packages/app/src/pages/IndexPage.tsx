import { Loading } from "@fiftyone/components";
import React from "react";
import { graphql } from "relay-runtime";
import Nav from "../components/Nav";
import { Route } from "../routing";

import { pagesQuery } from "./__generated__/pagesQuery.graphql";
import style from "./index.module.css";
import { usePreloadedQuery } from "react-relay";

const query = graphql`
  query pagesQuery($search: String = "", $count: Int, $cursor: String) {
    ...NavFragment
  }
`;

const IndexPage: Route<pagesQuery> = ({ prepared }) => {
  const queryRef = usePreloadedQuery(query, prepared);

  return (
    <>
      <Nav fragment={queryRef} />
      <div className={style.page}>
        <Loading>No dataset selected</Loading>
      </div>
    </>
  );
};

export default IndexPage;

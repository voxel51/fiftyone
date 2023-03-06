import { Loading } from "@fiftyone/components";
import React from "react";
import { graphql } from "relay-runtime";
import Nav from "../components/Nav";
import { Route } from "../routing";

import { IndexPageQuery } from "./__generated__/IndexPageQuery.graphql";
import style from "./index.module.css";
import { usePreloadedQuery } from "react-relay";
import withQueryNode from "../withQueryNode";

const IndexPageQueryNode = graphql`
  query IndexPageQuery($search: String = "", $count: Int, $cursor: String) {
    ...NavFragment
    ...configFragment
  }
`;

const IndexPage: Route<IndexPageQuery> = ({ prepared }) => {
  const queryRef = usePreloadedQuery(IndexPageQueryNode, prepared);

  return (
    <>
      <Nav fragment={queryRef} hasDataset={false} />
      <div className={style.page}>
        <Loading>No dataset selected</Loading>
      </div>
    </>
  );
};

export default withQueryNode(IndexPage, IndexPageQueryNode);

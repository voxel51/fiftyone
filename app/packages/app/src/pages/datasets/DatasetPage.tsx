import { Dataset, ViewSelection } from "@fiftyone/core";
import "@fiftyone/embeddings";
import "@fiftyone/looker-3d";
import "@fiftyone/map";
import "@fiftyone/relay";
import React from "react";
import { usePreloadedQuery } from "react-relay";
import { graphql } from "relay-runtime";

import Nav from "../../components/Nav";
import { Route } from "../../routing";
import style from "../index.module.css";
import { datasetQuery } from "./__generated__/datasetQuery.graphql";

const query = graphql`
  query datasetQuery(
    $search: String = ""
    $count: Int
    $cursor: String
    $savedViewSlug: String
    $name: String!
    $view: BSONArray
  ) {
    ...NavFragment
    ...datasetFragment
    ...savedViewsFragment
  }
`;

const DatasetPage: Route<datasetQuery> = ({ prepared }) => {
  const queryRef = usePreloadedQuery(query, prepared);

  return (
    <>
      <Nav fragment={queryRef} />
      <div className={style.page}>
        <ViewSelection.datasetQueryContext.Provider value={queryRef}>
          <Dataset />
        </ViewSelection.datasetQueryContext.Provider>
      </div>
    </>
  );
};

export default DatasetPage;

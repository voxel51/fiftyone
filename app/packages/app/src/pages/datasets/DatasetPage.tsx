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
import { DatasetPageQuery } from "./__generated__/DatasetPageQuery.graphql";

const DatasetPageQueryNode = graphql`
  query DatasetPageQuery(
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
    ...configFragment
  }
`;

const DatasetPage: Route<DatasetPageQuery> = ({ prepared }) => {
  const queryRef = usePreloadedQuery(DatasetPageQueryNode, prepared);

  return (
    <>
      <Nav fragment={queryRef} hasDataset={true} />
      <div className={style.page}>
        <ViewSelection.datasetQueryContext.Provider value={queryRef}>
          <Dataset />
        </ViewSelection.datasetQueryContext.Provider>
      </div>
    </>
  );
};

export default DatasetPage;

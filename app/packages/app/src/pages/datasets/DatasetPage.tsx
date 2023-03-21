import { Dataset, ViewSelection } from "@fiftyone/core";
import "@fiftyone/embeddings";
import "@fiftyone/looker-3d";
import "@fiftyone/map";
import "@fiftyone/relay";
import { NotFoundError } from "@fiftyone/utilities";
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
    dataset(name: $name, view: $view, savedViewSlug: $savedViewSlug) {
      name
      ...datasetFragment
    }
    ...NavFragment
    ...savedViewsFragment
    ...configFragment
    ...stageDefinitionsFragment
  }
`;

const DatasetPage: Route<DatasetPageQuery> = ({ prepared }) => {
  const data = usePreloadedQuery(DatasetPageQueryNode, prepared);

  if (!data.dataset?.name) {
    throw new NotFoundError({ path: `/datasets/${prepared.variables.name}` });
  }

  return (
    <>
      <Nav fragment={data} hasDataset={true} />
      <div className={style.page}>
        <ViewSelection.datasetQueryContext.Provider value={data}>
          <Dataset />
        </ViewSelection.datasetQueryContext.Provider>
      </div>
    </>
  );
};

export default DatasetPage;

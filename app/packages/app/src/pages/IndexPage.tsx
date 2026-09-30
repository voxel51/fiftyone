/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Snackbar } from "@fiftyone/core";
import { usePreloadedQuery } from "react-relay";
import { graphql } from "relay-runtime";
import Nav from "../components/Nav";
import { AddDataset, SelectDataset } from "../components/Starter";
import type { Route } from "../routing";
import type { IndexPageQuery } from "./__generated__/IndexPageQuery.graphql";
import style from "./index.module.css";

const IndexPageQueryNode = graphql`
  query IndexPageQuery($search: String = "", $count: Int, $cursor: String) {
    config {
      colorBy
      colorPool
      colorscale
      multicolorKeypoints
      showSkeletons
    }
    allDatasets: estimatedDatasetCount
    ...NavFragment
    ...configFragment
  }
`;

const IndexPage: Route<IndexPageQuery> = ({ prepared }) => {
  const queryRef = usePreloadedQuery(IndexPageQueryNode, prepared);
  const totalDatasets = queryRef.allDatasets;

  return (
    <Nav fragment={queryRef} hasDataset={false}>
      <div className={style.page} data-cy={"index-page"}>
        {totalDatasets === 0 ? <AddDataset /> : <SelectDataset />}
      </div>
      <Snackbar />
    </Nav>
  );
};

export default IndexPage;

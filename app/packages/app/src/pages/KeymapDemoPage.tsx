/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { usePreloadedQuery } from "react-relay";
import { graphql } from "relay-runtime";
import KeymapDemo from "../components/KeymapDemo";
import Nav from "../components/Nav";
import type { Route } from "../routing";
import type { KeymapDemoPageQuery } from "./__generated__/KeymapDemoPageQuery.graphql";

/**
 * Showcase route for the keymap POC. It needs no data of its own beyond the
 * `NavFragment` the header wants, so the query is deliberately minimal.
 */
const KeymapDemoPageQueryNode = graphql`
  query KeymapDemoPageQuery(
    $search: String = ""
    $count: Int
    $cursor: String
  ) {
    config {
      colorBy
      colorPool
      colorscale
      multicolorKeypoints
      showSkeletons
    }
    ...NavFragment
    # The app shell reads config through this fragment, so a route that renders
    # Nav has to request it even though the demo itself needs no data.
    ...configFragment
  }
`;

const KeymapDemoPage: Route<KeymapDemoPageQuery> = ({ prepared }) => {
  const queryRef = usePreloadedQuery(KeymapDemoPageQueryNode, prepared);

  return (
    <Nav fragment={queryRef} hasDataset={false}>
      <KeymapDemo />
    </Nav>
  );
};

export default KeymapDemoPage;

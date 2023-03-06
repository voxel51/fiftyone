import { PageQuery } from "@fiftyone/relay";
import React from "react";
import { PreloadedQuery } from "react-relay";
import { GraphQLTaggedNode, OperationType } from "relay-runtime";

function withQueryNode<
  T extends OperationType,
  P extends { prepared: PreloadedQuery<T> }
>(Component: React.FunctionComponent<P>, queryNode: GraphQLTaggedNode) {
  function QueryNode(props: P) {
    return (
      <PageQuery preloadedQuery={props.prepared} query={queryNode}>
        <Component {...props} />
      </PageQuery>
    );
  }

  return QueryNode;
}
export default withQueryNode;

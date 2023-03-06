import React from "react";
import { PreloadedQuery } from "react-relay";
import { GraphQLTaggedNode, OperationType } from "relay-runtime";

interface PageQuery<T extends OperationType> {
  ref: PreloadedQuery<T>;
  query: GraphQLTaggedNode;
}

let pageQueryRef: PageQuery<OperationType> = null;

export function getPageQuery<T extends OperationType>(): PageQuery<T> {
  return pageQueryRef as PageQuery<T>;
}

export function PageQuery<T extends OperationType>({
  query,
  preloadedQuery,
  children,
}: React.PropsWithChildren<{
  query: GraphQLTaggedNode;
  preloadedQuery: PreloadedQuery<T>;
}>) {
  pageQueryRef = { ref: preloadedQuery, query };

  return <>{children}</>;
}

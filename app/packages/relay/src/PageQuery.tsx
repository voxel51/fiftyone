import React from "react";
import { PreloadedQuery } from "react-relay";
import { ConcreteRequest, OperationType } from "relay-runtime";

export interface PageQuery<T extends OperationType> {
  preloadedQuery: PreloadedQuery<T>;
  concreteRequest: ConcreteRequest;
}
export type PageSubscription<T extends OperationType> = (
  pageQuery: PageQuery<T>
) => void;

let pageQueryRef: PageQuery<any> = null;

const subscribers = new Set<PageSubscription<OperationType>>();

export function getPageQuery<T extends OperationType>(): [
  PageQuery<T>,
  (subscription: PageSubscription<T>) => () => void
] {
  return [
    pageQueryRef as PageQuery<T>,
    (subscription) => {
      subscribers.add(subscription);

      return () => subscribers.delete(subscription);
    },
  ];
}

/**
 * A context component containing a relay concrete request and preloaded query
 * for use by `graphQLFragmentEffect` atom effects
 */
export function PageQueryContext<T extends OperationType>({
  concreteRequest,
  preloadedQuery,
  children,
  subscribe,
}: React.PropsWithChildren<
  PageQuery<T> & {
    subscribe: (fn: PageSubscription<T>) => () => void;
  }
>) {
  pageQueryRef = { preloadedQuery, concreteRequest };

  React.useEffect(() => {
    return subscribe((pageQuery) => {
      pageQueryRef = pageQuery;
    });
  }, [subscribe]);

  return <>{children}</>;
}

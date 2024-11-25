import { ComponentType, useCallback } from "react";
import { GraphQLTaggedNode, Variables, useQueryLoader } from "react-relay";
import { WiredProps } from "relay-nextjs/wired/component";

export default function withQueryRefresher<Props extends WiredProps>(
  Component: ComponentType<Props>,
  query: GraphQLTaggedNode
) {
  const ComponentWithRefresher = (props: Props) => {
    const { preloadedQuery, ...otherProps } = props;
    const [queryRef, loadQuery] = useQueryLoader(query, preloadedQuery);

    const refresh = useCallback(() => {
      loadQuery(queryRef?.variables as Variables, {
        fetchPolicy: "store-and-network",
      });
    }, [loadQuery, queryRef]);

    return (
      <Component preloadedQuery={queryRef} refresh={refresh} {...otherProps} />
    );
  };

  return ComponentWithRefresher;
}

export type QueryRefresherType = () => void;

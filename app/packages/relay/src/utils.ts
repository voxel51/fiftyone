import { getFragmentResourceForEnvironment } from "react-relay/lib/relay-hooks/FragmentResource";
import { KeyType, KeyTypeData } from "react-relay/relay-hooks/helpers";
import {
  Environment,
  getFragment,
  getFragmentIdentifier,
  GraphQLTaggedNode,
} from "relay-runtime";
import { getPageQuery } from "./Writer";

export function loadContext(
  fragment: GraphQLTaggedNode,
  environment: Environment,
  data: unknown
) {
  const node = getFragment(fragment);
  const identifier = getFragmentIdentifier(node, data);
  const FragmentResource = getFragmentResourceForEnvironment(environment);
  return {
    result: FragmentResource.readWithIdentifier(
      node,
      data,
      identifier,
      "graphQLSyncFragmentAtom()"
    ),
    FragmentResource,
  };
}

export function readFragment<TKey extends KeyType>(
  fragmentInput: GraphQLTaggedNode,
  fragmentRef: TKey
): KeyTypeData<TKey> {
  const node = getFragment(fragmentInput);
  const {
    pageQuery: {
      preloadedQuery: { environment },
    },
  } = getPageQuery();

  const identifier = getFragmentIdentifier(node, fragmentRef);
  const FragmentResource = getFragmentResourceForEnvironment(environment);

  return FragmentResource.readWithIdentifier(
    node,
    fragmentRef,
    identifier,
    "readFragment()"
  ).data;
}

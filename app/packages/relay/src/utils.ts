// @ts-ignore
import { getFragmentResourceForEnvironment } from "react-relay/lib/relay-hooks/FragmentResource";
import { KeyType, KeyTypeData } from "react-relay/relay-hooks/helpers";
import {
  GraphQLTaggedNode,
  IEnvironment,
  getFragment,
  getFragmentIdentifier,
} from "relay-runtime";
import { getPageQuery } from "./Writer";

export function loadContext(
  fragment: GraphQLTaggedNode,
  environment: IEnvironment,
  data: unknown
) {
  const node = getFragment(fragment);
  // @ts-ignore
  if (!data["__fragments"][node.name]) {
    throw new Error(`fragment ${node.name} not present`);
  }

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

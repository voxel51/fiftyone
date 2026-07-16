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
  data: unknown,
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
      "graphQLSyncFragmentAtom()",
    ),
    FragmentResource,
  };
}

/**
 * Resolves a nested Relay fragment chain from operation data.
 *
 * The returned context and parent belong to the last successfully resolved
 * fragment so callers can attach their own live subscription behavior.
 */
export function resolveFragmentChain(
  data: unknown,
  fragments: GraphQLTaggedNode[],
  keys: string[] | undefined,
  environment: IEnvironment,
) {
  let context: ReturnType<typeof loadContext> | undefined;
  let parent: unknown;

  for (let i = 0; i < fragments.length; i++) {
    const key = keys?.[i];
    if (key) {
      data =
        typeof data === "object" && data !== null
          ? (data as Record<string, unknown>)[key]
          : null;
    }

    if (!data) {
      return { context, data, missing: true, parent };
    }

    parent = data;
    context = loadContext(fragments[i], environment, data);
    data = context.result.data;
  }

  return { context, data, missing: false, parent };
}

export function readFragment<TKey extends KeyType>(
  fragmentInput: GraphQLTaggedNode,
  fragmentRef: TKey,
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
    "readFragment()",
  ).data;
}

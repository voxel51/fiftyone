import { Snapshot } from "react-relay";
import { AtomEffect } from "recoil";
import {
  createOperationDescriptor,
  GraphQLTaggedNode,
  readInlineData,
} from "relay-runtime";
import { KeyType, KeyTypeData } from "relay-runtime/lib/store/readInlineData";
import { getPageQuery } from "./PageQuery";

/**
 * An atom effect for automatic syncing between a global fragment used across
 * page queries
 */
export function graphQLFragmentEffect<T extends KeyType>(
  fragment: GraphQLTaggedNode
): AtomEffect<KeyTypeData<T>> {
  return ({ setSelf, trigger }) => {
    if (trigger == "set") {
      throw new Error("fragement not writeable");
    }

    const setter = (snapshot: Snapshot) => {
      if (!snapshot.isMissingData && snapshot.data != null) {
        setSelf(readInlineData(fragment, snapshot.data as T));
      }
    };
    const [{ preloadedQuery, concreteRequest }, subscribe] = getPageQuery();
    let operation = createOperationDescriptor(
      concreteRequest,
      preloadedQuery.variables
    );
    let operationDisposable = preloadedQuery.environment.retain(operation);
    const snapshot = preloadedQuery.environment.lookup(operation.fragment);
    setter(snapshot);

    const subscriptionDisposable = preloadedQuery.environment.subscribe(
      snapshot,
      setter
    );

    const unsubscribe = () => {
      operationDisposable?.dispose();
      subscriptionDisposable?.dispose();
    };

    subscribe(({ preloadedQuery, concreteRequest }) => {
      operationDisposable?.dispose();
      subscriptionDisposable?.dispose();

      operation = createOperationDescriptor(
        concreteRequest,
        preloadedQuery.variables
      );
      operationDisposable = preloadedQuery.environment.retain(operation);
      preloadedQuery.environment.subscribe(snapshot, setter);

      return unsubscribe;
    });

    return unsubscribe;
  };
}

export default graphQLFragmentEffect;

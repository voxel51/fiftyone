import {
  createOperationDescriptor,
  getRequest,
  GraphQLTaggedNode,
  readInlineData,
} from "relay-runtime";
import { KeyType, KeyTypeData } from "relay-runtime/lib/store/readInlineData";
import { AtomEffect } from "recoil";
import { getPageQuery } from "./PageQuery";

export default function graphQLFragmentEffect<T extends KeyType>(
  fragment: GraphQLTaggedNode
): AtomEffect<KeyTypeData<T>> {
  return ({ setSelf, trigger }) => {
    const ref = getPageQuery();
    const request = getRequest(ref.query);
    const operation = createOperationDescriptor(request, ref.ref.variables);
    const operationDisposable = ref.ref.environment.retain(operation);
    const snapshot = ref.ref.environment.lookup(operation.fragment);
    if (trigger === "get") {
      const data = readInlineData<T>(fragment, snapshot.data as T);
      setSelf(data);
    }

    const subscriptionDisposable = ref.ref.environment.subscribe(
      snapshot,
      (newSnapshot) => {
        if (!newSnapshot.isMissingData && newSnapshot.data != null) {
          setSelf(readInlineData(fragment, newSnapshot.data as T));
        }
      }
    );

    return () => {
      operationDisposable?.dispose();
      subscriptionDisposable?.dispose();
    };
  };
}

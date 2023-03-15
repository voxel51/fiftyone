import * as rfn from "@recoiljs/refine";
import {
  atomFamily,
  AtomFamilyOptions,
  RecoilState,
  SerializableParam,
} from "recoil";
import { syncEffect } from "recoil-sync";
import { GraphQLTaggedNode } from "relay-runtime";
import { KeyType, KeyTypeData } from "relay-runtime/lib/store/readInlineData";
import { stores_INTERNAL } from "./Writer";

export type GraphQLSyncFragmentAtomFamilyOptions<
  K,
  P extends SerializableParam
> = Omit<Omit<AtomFamilyOptions<K, P>, "default">, "effects">;

export type GraphQLSyncFragmentSyncOptions<
  T extends KeyType,
  K,
  P extends SerializableParam
> = {
  fragment: GraphQLTaggedNode;
  read: (data: KeyTypeData<T>) => K;
  storeKey: string;
  refine?: rfn.Checker<K>;
  sync?: (params: P) => boolean;
};

function graphQLSyncFragmentAtomFamily<
  T extends KeyType,
  K,
  P extends SerializableParam
>(
  fragmentOptions: GraphQLSyncFragmentSyncOptions<T, K, P>,
  options: GraphQLSyncFragmentAtomFamilyOptions<K, P>
) {
  if (!stores_INTERNAL.has(fragmentOptions.storeKey)) {
    stores_INTERNAL.set(fragmentOptions.storeKey, new Map());
  }

  const store = stores_INTERNAL.get(fragmentOptions.storeKey);

  const family = atomFamily({
    ...options,
    effects: (params) =>
      !fragmentOptions.sync || fragmentOptions.sync(params)
        ? [
            syncEffect({
              storeKey: fragmentOptions.storeKey,
              refine: rfn.voidable(rfn.custom<K>((v) => v as K)),
            }),
          ]
        : [],
  });

  return (params: P): RecoilState<K> => {
    const atom = family(params);

    if (!store.has(atom.key)) {
      store.set(atom.key, {
        fragmentInput: fragmentOptions.fragment,
        reader: fragmentOptions.read,
      });
    }

    return atom;
  };
}

export default graphQLSyncFragmentAtomFamily;

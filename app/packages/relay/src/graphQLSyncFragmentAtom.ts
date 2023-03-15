import * as rfn from "@recoiljs/refine";
import { atom, AtomOptions } from "recoil";
import { syncEffect } from "recoil-sync";
import { GraphQLTaggedNode } from "relay-runtime";
import { KeyType, KeyTypeData } from "relay-runtime/lib/store/readInlineData";
import { stores_INTERNAL } from "./Writer";

export type GraphQLSyncFragmentAtomFamilyOptions<K> = Omit<
  Omit<AtomOptions<K>, "default">,
  "effects"
>;

export type GraphQLSyncFragmentSyncOptions<T extends KeyType, K> = {
  fragment: GraphQLTaggedNode;
  read: (data: KeyTypeData<T>) => K;
  storeKey: string;
  refine?: rfn.Checker<K>;
};

function graphQLSyncFragmentAtom<T extends KeyType, K>(
  fragmentOptions: GraphQLSyncFragmentSyncOptions<T, K>,
  options: GraphQLSyncFragmentAtomFamilyOptions<K>
) {
  if (!stores_INTERNAL.has(fragmentOptions.storeKey)) {
    stores_INTERNAL.set(fragmentOptions.storeKey, new Map());
  }

  const store = stores_INTERNAL.get(fragmentOptions.storeKey);
  store.set(options.key, {
    fragmentInput: fragmentOptions.fragment,
    reader: fragmentOptions.read,
  });

  return atom({
    ...options,
    effects: [
      syncEffect({
        storeKey: fragmentOptions.storeKey,
        refine: rfn.voidable(rfn.custom<K>((v) => v as K)),
      }),
    ],
  });
}

export default graphQLSyncFragmentAtom;

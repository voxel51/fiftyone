import * as rfn from "@recoiljs/refine";
import { atom, AtomOptions } from "recoil";
import { syncEffect } from "recoil-sync";
import { GraphQLTaggedNode } from "relay-runtime";
import { KeyType, KeyTypeData } from "relay-runtime/lib/store/readInlineData";
import { stores_INTERNAL } from "./internal";

export type GraphQLSyncFragmentAtomOptions<K> = AtomOptions<K>;

export type GraphQLSyncFragmentSyncAtomOptions<
  T extends KeyType,
  K = KeyTypeData<T>
> = {
  fragments: GraphQLTaggedNode[];
  keys?: string[];
  read?: (data: KeyTypeData<T>) => K;
  storeKey: string;
  refine?: rfn.Checker<K>;
};

/**
 * Creates a recoil atom synced with a recoil sync store. If the fragment path
 * cannot be read from given the parent fragment keys and the optional final
 * read function, the atom's default value will be used
 */
export function graphQLSyncFragmentAtom<T extends KeyType, K = KeyTypeData<T>>(
  fragmentOptions: GraphQLSyncFragmentSyncAtomOptions<T, K>,
  options: GraphQLSyncFragmentAtomOptions<K>
) {
  if (!stores_INTERNAL.has(fragmentOptions.storeKey)) {
    stores_INTERNAL.set(fragmentOptions.storeKey, new Map());
  }

  const store = stores_INTERNAL.get(fragmentOptions.storeKey);
  store.set(options.key, {
    fragments: fragmentOptions.fragments,
    keys: fragmentOptions.keys,
    reader: fragmentOptions.read || ((value) => value),
  });

  return atom({
    ...options,
    effects: [
      syncEffect({
        storeKey: fragmentOptions.storeKey,
        refine:
          fragmentOptions.refine || rfn.voidable(rfn.custom<K>((v) => v as K)),
      }),
      ...(options.effects || []),
    ],
  });
}

export default graphQLSyncFragmentAtom;

import * as rfn from "@recoiljs/refine";
import { atomFamily, AtomFamilyOptions, SerializableParam } from "recoil";
import { syncEffect } from "recoil-sync";
import { GraphQLTaggedNode } from "relay-runtime";
import { KeyType, KeyTypeData } from "relay-runtime/lib/store/readInlineData";
import { stores_INTERNAL } from "./internal";

export type GraphQLSyncFragmentAtomFamilyOptions<
  K,
  P extends SerializableParam
> = AtomFamilyOptions<K, P>;

export type GraphQLSyncFragmentSyncAtomFamilyOptions<
  T extends KeyType,
  K,
  P extends SerializableParam
> = {
  fragments: GraphQLTaggedNode[];
  keys?: string[];
  read: (data: KeyTypeData<T>) => K;
  storeKey: string;
  refine?: rfn.Checker<K>;
  sync?: (params: P) => boolean;
};

export function graphQLSyncFragmentAtomFamily<
  T extends KeyType,
  K,
  P extends SerializableParam
>(
  fragmentOptions: GraphQLSyncFragmentSyncAtomFamilyOptions<T, K, P>,
  options: GraphQLSyncFragmentAtomFamilyOptions<K, P>
) {
  if (!stores_INTERNAL.has(fragmentOptions.storeKey)) {
    stores_INTERNAL.set(fragmentOptions.storeKey, new Map());
  }

  const store = stores_INTERNAL.get(fragmentOptions.storeKey);

  const family = atomFamily({
    ...options,
    effects: (params) => {
      const effects =
        !fragmentOptions.sync || fragmentOptions.sync(params)
          ? [
              syncEffect({
                storeKey: fragmentOptions.storeKey,
                refine:
                  fragmentOptions.refine ||
                  rfn.voidable(rfn.custom<K>((v) => v as K)),
              }),
            ]
          : [];

      let additional = options.effects || [];
      if (additional instanceof Function) {
        additional = additional(params);
      }

      return [...effects, ...additional];
    },
  });

  return (params: P) => {
    const atom = family(params);

    if (!store.has(atom.key)) {
      store.set(atom.key, {
        fragments: fragmentOptions.fragments,
        keys: fragmentOptions.keys,
        reader: fragmentOptions.read,
      });
    }

    return atom;
  };
}

export default graphQLSyncFragmentAtomFamily;

import { Disposable } from "react-relay";
import {
  atomFamily,
  AtomFamilyOptions,
  SerializableParam,
  TransactionInterface_UNSTABLE,
} from "recoil";
import { GraphQLTaggedNode, OperationType } from "relay-runtime";
import { KeyType, KeyTypeData } from "relay-runtime/lib/store/readInlineData";
import { loadContext } from "./utils";
import { getPageQuery, PageQuery } from "./Writer";

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
  sync?: (params: P) => boolean;
};

/**
 * Creates a recoil atom family synced with a recoil sync store. If the
 * fragment path cannot be read from given the parent fragment keys and the
 * optional final read function, the atom's default value will be used
 */
export function graphQLSyncFragmentAtomFamily<
  T extends KeyType,
  K,
  P extends SerializableParam
>(
  fragmentOptions: GraphQLSyncFragmentSyncAtomFamilyOptions<T, K, P>,
  options: GraphQLSyncFragmentAtomFamilyOptions<K, P>
) {
  const family = atomFamily({
    ...options,
    effects: (params) => {
      const effects =
        !fragmentOptions.sync || fragmentOptions.sync(params)
          ? [
              ({ setSelf, trigger }) => {
                if (trigger === "set") {
                  return;
                }
                const { pageQuery, subscribe } = getPageQuery();
                let ctx: ReturnType<typeof loadContext>;
                let parent;
                let disposable: Disposable;
                const setter = (d, int?: TransactionInterface_UNSTABLE) => {
                  const set = int ? (v) => int.set(family(params), v) : setSelf;
                  set(
                    fragmentOptions.read && d !== null
                      ? fragmentOptions.read(d)
                      : d === null
                      ? options.default
                      : d
                  );
                };

                const run = (
                  { data, preloadedQuery }: PageQuery<OperationType>,
                  transactionInterface?: TransactionInterface_UNSTABLE
                ): Disposable => {
                  try {
                    fragmentOptions.fragments.forEach((fragment, i) => {
                      if (fragmentOptions.keys && fragmentOptions.keys[i]) {
                        data = data[fragmentOptions.keys[i]];
                      }

                      // @ts-ignore
                      ctx = loadContext(
                        fragment,
                        preloadedQuery.environment,
                        data
                      );
                      parent = data;
                      data = ctx.result.data;
                    });
                    setter(data, transactionInterface);
                    disposable?.dispose();

                    return ctx.FragmentResource.subscribe(ctx.result, () => {
                      const update = loadContext(
                        fragmentOptions.fragments[
                          fragmentOptions.fragments.length - 1
                        ],
                        preloadedQuery.environment,
                        parent
                      ).result.data;
                      setter(update);
                    });
                  } catch (e) {
                    setter(null, transactionInterface);
                    return undefined;
                  }
                };

                disposable = run(pageQuery);

                const dispose = subscribe(run);
                return () => {
                  dispose();
                  disposable?.dispose();
                };
              },
            ]
          : [];

      let additional = options.effects || [];
      if (additional instanceof Function) {
        additional = additional(params);
      }

      return [...effects, ...additional];
    },
  });

  return (params: P) => family(params);
}

export default graphQLSyncFragmentAtomFamily;

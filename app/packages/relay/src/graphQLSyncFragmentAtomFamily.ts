import { Disposable } from "react-relay";
import {
  AtomEffect,
  AtomFamilyOptions,
  SerializableParam,
  TransactionInterface_UNSTABLE,
  atomFamily,
} from "recoil";
import { GraphQLTaggedNode, OperationType } from "relay-runtime";
import { KeyType, KeyTypeData } from "relay-runtime/lib/store/readInlineData";
import { PageQuery, getPageQuery } from "./Writer";
import { loadContext } from "./utils";

export type GraphQLSyncFragmentAtomFamilyOptions<
  K,
  P extends SerializableParam
> = Omit<AtomFamilyOptions<K, P>, "default">;

export type GraphQLSyncFragmentSyncAtomFamilyOptions<
  T extends KeyType,
  K,
  P extends SerializableParam
> = {
  fragments: GraphQLTaggedNode[];
  keys?: string[];
  read?: (
    data: KeyTypeData<T>,
    previous: KeyTypeData<T> | null,
    params: P
  ) => K | ((current: K) => K);
  sync?: (params: P) => boolean;
  default: K;
};

/**
 * Creates a recoil atom family synced with a relay fragment via its path in a
 * query. If the fragment path cannot be read from given the parent fragment
 * keys. Includes the optional `sync` parameter to conditionally opt-in to
 * fragment syncing given an atom instance's parameters `P`.
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
    default: fragmentOptions.default,
    effects: (params) => {
      const effects =
        !fragmentOptions.sync || fragmentOptions.sync(params)
          ? [
              ({ setSelf, trigger }: Parameters<AtomEffect<K>>[0]) => {
                // recoil state should be initialized via RecoilRoot's initializeState
                // during tests
                if (
                  typeof process !== "undefined" &&
                  process.env.MODE === "test"
                )
                  return;

                if (trigger === "set") {
                  return;
                }
                const { pageQuery, subscribe } = getPageQuery();
                let ctx: ReturnType<typeof loadContext>;
                let parent: unknown;
                let disposable: Disposable | undefined = undefined;
                let previous: null | T[" $data"] = null;
                const setter = (
                  d: null | T[" $data"],
                  int?: TransactionInterface_UNSTABLE
                ) => {
                  const set = int
                    ? (v: K) => int.set(family(params), v)
                    : setSelf;
                  set(
                    fragmentOptions.read && d !== null
                      ? fragmentOptions.read(d, previous, params)
                      : d === null
                      ? fragmentOptions.default
                      : (d as K)
                  );
                  previous = d;
                };

                const run = (
                  { data, preloadedQuery }: PageQuery<OperationType>,
                  transactionInterface?: TransactionInterface_UNSTABLE
                ): Disposable | undefined => {
                  try {
                    fragmentOptions.fragments.forEach((fragment, i) => {
                      if (fragmentOptions.keys && fragmentOptions.keys[i]) {
                        // @ts-ignore
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

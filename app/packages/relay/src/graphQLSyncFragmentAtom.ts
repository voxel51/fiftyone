import { Disposable } from "react-relay";
import { KeyTypeData } from "react-relay/relay-hooks/helpers";
import {
  atom,
  AtomOptions,
  ReadWriteSelectorOptions,
  TransactionInterface_UNSTABLE,
} from "recoil";
import { GraphQLTaggedNode, OperationType } from "relay-runtime";
import { KeyType } from "relay-runtime/lib/store/readInlineData";
import { selectorWithEffect } from "./selectorWithEffect";
import { loadContext } from "./utils";
import { getPageQuery, PageQuery } from "./Writer";

export type GraphQLSyncFragmentAtomOptions<K> = Omit<AtomOptions<K>, "default">;

export type GraphQLSyncFragmentSyncAtomOptions<T extends KeyType, K> = {
  fragments: GraphQLTaggedNode[];
  keys?: string[];
  read?: (data: KeyTypeData<T>, previous: KeyTypeData<T> | null) => K;
  default?: K;
  selectorEffect?:
    | "write"
    | boolean
    | ((newValue: Parameters<ReadWriteSelectorOptions<K>["set"]>[1]) => void);
};

const isTest = typeof process !== "undefined" && process.env.MODE === "test";

/**
 * Creates a recoil atom synced with a relay fragment via its path in a query.
 * If the fragment path cannot be read from given the parent fragment keys and
 * the optional final read function, the atom's default value will be used
 */
export function graphQLSyncFragmentAtom<T extends KeyType, K>(
  fragmentOptions: GraphQLSyncFragmentSyncAtomOptions<T, K>,
  options: GraphQLSyncFragmentAtomOptions<K>
) {
  const value = atom({
    ...options,
    default: fragmentOptions.default,
    effects: [
      ...(options.effects || []),
      ({ setSelf, trigger }) => {
        // recoil state should be initialized via RecoilRoot's initializeState
        // during tests
        if (isTest) return;

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
          const set = int ? (v: K) => int.set(value, v) : setSelf;
          set(
            fragmentOptions.read && d !== null
              ? fragmentOptions.read(d, previous)
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
              ctx = loadContext(fragment, preloadedQuery.environment, data);
              parent = data;
              data = ctx.result.data;
            });
            setter(data, transactionInterface);
            disposable?.dispose();

            return ctx.FragmentResource.subscribe(ctx.result, () => {
              const update = loadContext(
                fragmentOptions.fragments[fragmentOptions.fragments.length - 1],
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
    ],
  });

  if (fragmentOptions.selectorEffect) {
    return selectorWithEffect(
      {
        key: `_${options.key}__setter`,
        get: ({ get }) => get(value),
        set:
          fragmentOptions.selectorEffect instanceof Function
            ? fragmentOptions.selectorEffect
            : undefined,
        state:
          fragmentOptions.selectorEffect === "write" || isTest
            ? value
            : undefined,
      },
      options.key
    );
  }

  return value;
}

export default graphQLSyncFragmentAtom;

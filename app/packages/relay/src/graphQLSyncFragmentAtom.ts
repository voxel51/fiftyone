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
import { getPageQuery, PageQuery, registerPageSync } from "./Writer";

export type GraphQLSyncFragmentAtomOptions<K> = Omit<AtomOptions<K>, "default">;

export type GraphQLSyncFragmentSyncAtomOptions<T extends KeyType, K> = {
  fragments: GraphQLTaggedNode[];
  keys?: string[];
  read?: (data: KeyTypeData<T>, previous: KeyTypeData<T> | null) => K;
  default?: K;
  selectorEffect?:
    | "write"
    | boolean
    | ((...params: Parameters<ReadWriteSelectorOptions<K>["set"]>) => K);
};

const isTest = typeof process !== "undefined" && process.env.MODE === "test";

/**
 * Creates a recoil atom synced with a relay fragment via its path in a query.
 * If the fragment path cannot be read from given the parent fragment keys and
 * the optional final read function, the atom's default value will be used.
 *
 * Synchronization happens through two complementary paths:
 *
 * 1. The atom effect below initializes active consumers, follows page changes,
 *    and owns the live Relay fragment subscription.
 * 2. The page synchronizer registered after the atom definition participates
 *    in every Writer transaction, including transitions published before this
 *    atom has an active consumer.
 *
 * The second path prevents a long-lived RecoilRoot from exposing a retained
 * value from the previous dataset while the next dataset's consumers mount.
 */
export function graphQLSyncFragmentAtom<T extends KeyType, K = T[" $data"]>(
  fragmentOptions: GraphQLSyncFragmentSyncAtomOptions<T, K>,
  options: GraphQLSyncFragmentAtomOptions<K>,
) {
  const value = atom({
    ...options,
    default: fragmentOptions.default,
    effects: [
      ...(options.effects || []),
      ({ setSelf, trigger }) => {
        // recoil state should be initialized via RecoilRoot's initializeState
        // during tests
        if (isTest) return undefined;

        if (trigger === "set") {
          return undefined;
        }
        const { pageQuery, subscribe } = getPageQuery();
        let ctx: ReturnType<typeof loadContext>;
        let parent: unknown;
        let disposable: Disposable | undefined = undefined;
        let previous: null | T[" $data"] = null;
        const setter = (
          d: null | T[" $data"],
          int?: TransactionInterface_UNSTABLE,
        ) => {
          const set = int ? (v: K) => int.set(value, v) : setSelf;
          set(
            fragmentOptions.read && d !== null
              ? fragmentOptions.read(d, previous)
              : d === null
                ? fragmentOptions.default
                : (d as K),
          );

          previous = d;
        };

        const run = (
          page: PageQuery<OperationType>,
          transactionInterface?: TransactionInterface_UNSTABLE,
        ): Disposable | undefined => {
          const preloadedQuery = page.preloadedQuery;
          let data = page.data;
          try {
            for (let i = 0; i < fragmentOptions.fragments.length; i++) {
              const fragment = fragmentOptions.fragments[i];

              if (fragmentOptions.keys && fragmentOptions.keys[i]) {
                // @ts-ignore
                data = data[fragmentOptions.keys[i]];
              }

              if (!data) {
                const unlisten = ctx.FragmentResource.subscribe(
                  ctx.result,
                  () => {
                    run(page);
                    unlisten();
                  },
                );
              }

              // @ts-ignore
              ctx = loadContext(fragment, preloadedQuery.environment, data);
              parent = data;
              data = ctx.result.data;
            }
            setter(data, transactionInterface);
            disposable?.dispose();

            return ctx.FragmentResource.subscribe(ctx.result, () => {
              const update = loadContext(
                fragmentOptions.fragments[fragmentOptions.fragments.length - 1],
                preloadedQuery.environment,
                parent,
              ).result.data;
              setter(update);
              !update && run(page);
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

  /*
   * The effect subscription above exists only after this atom is initialized
   * in the current consumer lifecycle. The application keeps its RecoilRoot
   * mounted while routing between datasets, so a page can be published while
   * a particular atom has no mounted consumer even though its previous value
   * is still observable through retained selector state.
   *
   * Registering at atom-definition time closes that gap. Writer invokes these
   * keyed synchronizers before ordinary effect subscribers and inside the same
   * Recoil transaction, so dataset identity, media type, fields, and other
   * fragment-backed state all advance as one snapshot. Keying by the Recoil
   * atom key also makes module replacement overwrite the prior registration
   * instead of accumulating duplicate callbacks.
   *
   * This does not replace the atom effect. The effect still owns live Relay
   * updates after mount; this callback establishes the page-transition
   * baseline. An active atom may therefore receive the same page from both
   * paths, but both writes are derived from the identical page payload.
   */
  // Match the atom effect above: tests initialize Recoil state directly and do
  // not participate in the runtime Writer synchronization lifecycle.
  if (!isTest) {
    let previousPageData: null | T[" $data"] = null;
    registerPageSync(options.key, (page, transactionInterface) => {
      const reset = () => {
        transactionInterface.set(value, fragmentOptions.default);
        previousPageData = null;
      };

      let data: unknown = page.data;
      try {
        for (let i = 0; i < fragmentOptions.fragments.length; i++) {
          // `keys[i]` descends from the current operation/fragment result to the
          // fragment reference consumed at this level. For example, "dataset"
          // moves from the query response to its Dataset fragment reference.
          const key = fragmentOptions.keys?.[i];
          if (key) {
            data =
              typeof data === "object" && data !== null
                ? (data as Record<string, unknown>)[key]
                : null;
          }

          // A missing parent belongs to the new page. Reset immediately instead
          // of leaving a valid-looking value from the previous dataset in Recoil.
          if (!data) {
            reset();
            return;
          }

          // Relay masks fragment data. Resolve the current fragment reference,
          // then feed its unmasked result into the next fragment in the chain.
          data = loadContext(
            fragmentOptions.fragments[i],
            page.preloadedQuery.environment,
            data,
          ).result.data;
        }

        const fragmentData = data as T[" $data"];

        // Keep an independent history for the eager path. Some `read` functions
        // compare dataset IDs with their previous fragment to reset local state;
        // sharing the effect's history would make duplicate page delivery alter
        // those semantics depending on whether a consumer happened to be mounted.
        transactionInterface.set(
          value,
          fragmentOptions.read && fragmentData !== null
            ? fragmentOptions.read(fragmentData, previousPageData)
            : fragmentData === null
              ? fragmentOptions.default
              : (fragmentData as K),
        );
        previousPageData = fragmentData;
      } catch {
        // A missing fragment reference or incompatible query shape must not leak
        // state across pages. The normal atom effect can populate the value later
        // if Relay makes the fragment available through a live update.
        reset();
      }
    });
  }

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
      options.key,
    );
  }

  return value;
}

export default graphQLSyncFragmentAtom;

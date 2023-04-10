import { default as React } from "react";
import { PreloadedQuery } from "react-relay";
import {
  TransactionInterface_UNSTABLE,
  useRecoilTransaction_UNSTABLE,
} from "recoil";
import { ConcreteRequest, OperationType } from "relay-runtime";
import type { Set } from "./selectorWithEffect";
import { SelectorEffectContext } from "./selectorWithEffect";

export interface PageQuery<T extends OperationType> {
  preloadedQuery: PreloadedQuery<T>;
  concreteRequest: ConcreteRequest;
  data: T["response"];
}

export type PageSubscription<T extends OperationType> = (
  pageQuery: PageQuery<T>,
  transationInterface: TransactionInterface_UNSTABLE
) => void;

let pageQueryReader: () => PageQuery<OperationType> = null;

const subscribers = new Set<PageSubscription<OperationType>>();

export function subscribe<T extends OperationType>(
  subscription: PageSubscription<T>
) {
  subscribers.add(subscription);

  return () => subscribers.delete(subscription);
}

export function getPageQuery() {
  return { pageQuery: pageQueryReader(), subscribe };
}

type WriterProps<T extends OperationType> = React.PropsWithChildren<{
  read: () => PageQuery<T>;
  setters: Map<string, Set<unknown>>;
  subscribe?: (fn: (pageQuery: PageQuery<T>) => void) => () => void;
}>;

/**
 * A recoil sync implementation for atomic syncing between relay fragment data
 * and atom and atom families. For atoms that also require atomic syncing that
 * do not use relay fragment data, external and updateExternals can be used.
 */
export function Writer<T extends OperationType>({
  children,
  read,
  subscribe,
  setters,
}: WriterProps<T>) {
  pageQueryReader = read;

  const set = useRecoilTransaction_UNSTABLE(
    (transactionInterface) =>
      (cb: (TransactionInterface: TransactionInterface_UNSTABLE) => void) => {
        cb(transactionInterface);
      },
    []
  );

  React.useEffect(() => {
    return subscribe((pageQuery) => {
      pageQueryReader = () => pageQuery;
      set((transactionInterface) => {
        subscribers.forEach((cb) => cb(pageQuery, transactionInterface));
      });
    });
  }, [set, subscribe]);

  return (
    <SelectorEffectContext setters={setters}>{children}</SelectorEffectContext>
  );
}

export default Writer;

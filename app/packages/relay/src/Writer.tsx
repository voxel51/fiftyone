import { default as React } from "react";
import { PreloadedQuery } from "react-relay";
import {
  TransactionInterface_UNSTABLE,
  useRecoilTransaction_UNSTABLE,
} from "recoil";
import { ConcreteRequest, OperationType } from "relay-runtime";
import { SelectorEffectContext, Setter } from "./selectorWithEffect";

export interface PageQuery<T extends OperationType> {
  preloadedQuery: PreloadedQuery<T>;
  concreteRequest: ConcreteRequest;
  data: T["response"];
}

export type PageSubscription<T extends OperationType> = (
  pageQuery: PageQuery<T>,
  transationInterface: TransactionInterface_UNSTABLE
) => void;

let pageQueryReader: () => PageQuery<OperationType>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const subscribers = new Set<PageSubscription<any>>();

export function subscribe<T extends OperationType>(
  subscription: PageSubscription<T>
) {
  subscribers.add(subscription);

  return () => {
    subscribers.delete(subscription);
  };
}

export function getPageQuery() {
  return { pageQuery: pageQueryReader(), subscribe };
}

type WriterProps<T extends OperationType> = React.PropsWithChildren<{
  read: () => PageQuery<T>;
  setters: Map<string, Setter>;
  subscribe: (fn: (pageQuery: PageQuery<T>) => void) => () => void;
}>;

/**
 * A Recoil/Relay atomic syncing interface between a current page query
 * and atom and atom families
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
      set((transactionInterface) =>
        subscribers.forEach((cb) => cb(pageQuery, transactionInterface))
      );
    });
  }, [set, subscribe]);

  return (
    <SelectorEffectContext setters={setters}>{children}</SelectorEffectContext>
  );
}

export default Writer;

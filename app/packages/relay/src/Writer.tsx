import React from "react";
import { DefaultValue } from "recoil";
import { RecoilSync } from "recoil-sync";
import {
  GraphQLTaggedNode,
  OperationType,
  readInlineData,
} from "relay-runtime";

export const stores_INTERNAL = new Map<
  string,
  Map<
    string,
    { fragmentInput: GraphQLTaggedNode; reader: (value: unknown) => unknown }
  >
>();

type WriterProps<T extends OperationType> = React.PropsWithChildren<{
  storeKey: string;
  writer: (itemKey: string, value: unknown) => void;
  queryContext: React.MutableRefObject<T["response"]>;
  subscription: (update: (data: T["response"]) => void) => () => void;
}>;

function Writer<T extends OperationType>({
  children,
  queryContext,
  storeKey,
  subscription,
  writer,
}: WriterProps<T>) {
  const store = React.useMemo(() => stores_INTERNAL.get(storeKey), [storeKey]);

  const readValue = React.useCallback(
    (itemKey: string, query?: T["response"]) => {
      query ??= queryContext.current;
      let value: unknown = DefaultValue;
      try {
        const item = store.get(itemKey);

        value = item.reader(
          readInlineData(
            item.fragmentInput,
            query as { " $fragmentSpreads": unknown }
          )
        );
      } catch {}

      return value;
    },
    [queryContext, store]
  );

  return (
    <RecoilSync
      read={React.useCallback(
        (itemKey) => {
          if (!store.has(itemKey)) {
            throw new Error(`unexpected synced atom:  ${itemKey}`);
          }

          return readValue(itemKey);
        },
        [readValue, store]
      )}
      storeKey={storeKey}
      listen={React.useCallback(
        ({ updateAllKnownItems }) => {
          return subscription((data) => {
            const values = new Map();
            store.forEach((_, key) => values.set(key, readValue(key, data)));
            updateAllKnownItems(values);
          });
        },
        [readValue, store, subscription]
      )}
      write={React.useCallback(
        ({ diff }) => {
          diff.forEach((value, key) => writer(key, value));
        },
        [writer]
      )}
    >
      {children}
    </RecoilSync>
  );
}

export default Writer;

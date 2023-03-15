import React from "react";
import { DefaultValue } from "recoil";
import { RecoilSync } from "recoil-sync";
import { OperationType, readInlineData } from "relay-runtime";
import { stores_INTERNAL } from "./internal";

type WriterProps<T extends OperationType> = React.PropsWithChildren<{
  external: Map<string, () => unknown>;
  storeKey: string;
  writer: (itemKey: string, value: unknown) => void;
  read: () => T["response"];
  subscription: (update: (data: T["response"]) => void) => () => void;
}>;

export function Writer<T extends OperationType>({
  children,
  read,
  storeKey,
  subscription,
  writer,
  external,
}: WriterProps<T>) {
  const store = React.useMemo(() => stores_INTERNAL.get(storeKey), [storeKey]);

  const readValue = React.useCallback(
    (itemKey: string, query?: T["response"]) => {
      query ??= read();
      let value: unknown = new DefaultValue();
      try {
        const item = store.get(itemKey);

        value = item.reader(
          item.fragments.reduce((data, fragment, i) => {
            const result = readInlineData(fragment, data);
            if (item.keys && item.keys[i]) {
              return result[item.keys[i]];
            }
            return result;
          }, query as { " $fragmentSpreads": unknown })
        );
      } catch (e) {
        console.log(
          itemKey,
          e
        ); /* fragment not present, use default atom value */
      }

      return value;
    },
    [store]
  );

  return (
    <RecoilSync
      read={React.useCallback(
        (itemKey) => {
          if (external.has(itemKey)) {
            return external.get(itemKey)();
          }

          if (!store.has(itemKey)) {
            throw new Error(`unexpected synced atom:  ${itemKey}`);
          }

          return readValue(itemKey);
        },
        [external, readValue, store]
      )}
      storeKey={storeKey}
      listen={React.useCallback(
        ({ updateAllKnownItems }) => {
          return subscription((data) => {
            const values = new Map();
            external.forEach((fn, itemKey) => values.set(itemKey, fn()));
            store.forEach((_, key) => values.set(key, readValue(key, data)));
            updateAllKnownItems(values);
          });
        },
        [external, readValue, store, subscription]
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

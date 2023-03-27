import React from "react";
import { DefaultValue } from "recoil";
import { ItemSnapshot, RecoilSync } from "recoil-sync";
import { OperationType, readInlineData } from "relay-runtime";
import { stores_INTERNAL } from "./internal";

type WriterProps<T extends OperationType> = React.PropsWithChildren<{
  external: Map<string, () => unknown>;
  storeKey: string;
  writer: (itemKey: string, value: unknown) => void;
  read: () => T["response"];
  subscription: (update: (data: T["response"]) => void) => () => void;
  updateExternals: React.MutableRefObject<
    ((items: ItemSnapshot) => void) | undefined
  >;
}>;

export function Writer<T extends OperationType>({
  children,
  read,
  storeKey,
  subscription,
  writer,
  external,
  updateExternals,
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
            if (item.keys && item.keys[i]) {
              data = data[item.keys[i]];
            }
            return readInlineData(fragment, data);
          }, query as { " $fragmentSpreads": unknown })
        );
      } catch (e) {
        /* fragment not present, use default atom value */
      }

      return value;
    },
    [read, store]
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
        ({ updateAllKnownItems, updateItems }) => {
          updateExternals.current = (items) => {
            items.forEach((_, key) => {
              if (!external.has(key)) {
                throw new Error(`${key} is not external`);
              }
            });
            updateItems(items);
          };
          const cleanup = subscription((data) => {
            const values = new Map();
            external.forEach((fn, itemKey) => values.set(itemKey, fn()));
            store.forEach((_, key) => values.set(key, readValue(key, data)));
            updateAllKnownItems(values);
          });

          return () => {
            cleanup();
            updateExternals.current = undefined;
          };
        },
        [external, readValue, store, subscription, updateExternals]
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

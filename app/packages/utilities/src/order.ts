import { useMemo, useState } from "react";

export function useItemsWithOrderPersistence<T extends SortableItemType>(
  items: T[],
  key: string
) {
  const initialOrder = localStorage.getItem(key);
  const [order, updateOrder] = useState(initialOrder);

  const orderedItems = useMemo(() => {
    if (order) {
      try {
        const idToIndex: IdToIndexType = JSON.parse(order);
        return sortItems(items, idToIndex);
      } catch (e) {
        console.error(e);
      }
    }
    return items;
  }, [items, order]);

  const setOrder = (items: T[]) => {
    const orderCache = JSON.stringify(
      items.reduce((acc, item, index) => {
        acc[item.id] = index;
        return acc;
      }, {} as IdToIndexType)
    );
    localStorage.setItem(key, orderCache);
    updateOrder(orderCache);
  };
  return { orderedItems, setOrder };
}

function sortItems<T extends SortableItemType>(
  items: T[],
  idToIndex: IdToIndexType
) {
  const sortedItems = [...items];
  const totalItems = items.length;
  return sortedItems.sort((a, b) => {
    const aIndex = idToIndex[a.id] ?? totalItems;
    const bIndex = idToIndex[b.id] ?? totalItems;
    const aPriority = a.priority ?? 0;
    const bPriority = b.priority ?? 0;
    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }
    return aIndex - bIndex;
  });
}

type SortableItemType = {
  id: string;
  priority?: number;
};

type IdToIndexType = {
  [key: string]: number;
};

export function useItemsWithOrderPersistence(
  items: SortableItemsType,
  key: string
) {
  const order = localStorage.getItem(key);
  let orderedItems = items;
  if (order) {
    try {
      const idToIndex: IdToIndexType = JSON.parse(order);
      orderedItems = sortItems(items, idToIndex);
    } catch (e) {
      console.error(e);
    }
  }

  const setOrder = (items: SortableItemsType) => {
    localStorage.setItem(
      key,
      JSON.stringify(
        items.reduce((acc, item, index) => {
          acc[item.id] = index;
          return acc;
        }, {} as IdToIndexType)
      )
    );
  };
  return { orderedItems, setOrder };
}

function sortItems(items: SortableItemsType, idToIndex: IdToIndexType) {
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

type SortableItemsType = SortableItemType[];

type IdToIndexType = {
  [key: string]: number;
};

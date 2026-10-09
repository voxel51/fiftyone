/**
 * Counts element insertions and removals under `root`. A subtree inserted
 * at once counts as one element, so this counts row mounts, not tiles.
 */
export const createMutationCounter = (root: Node) => {
  let added = 0;
  let removed = 0;

  const elements = (nodes: NodeList) =>
    [...nodes].filter((node) => node.nodeType === Node.ELEMENT_NODE).length;

  const count = (records: MutationRecord[]) => {
    for (const record of records) {
      added += elements(record.addedNodes);
      removed += elements(record.removedNodes);
    }
  };

  const observer = new MutationObserver(count);
  observer.observe(root, { childList: true, subtree: true });

  // records not yet delivered to the callback are read synchronously
  const take = () => {
    count(observer.takeRecords());
    return { added, removed };
  };

  return {
    take,
    reset: () => {
      take();
      added = removed = 0;
    },
    disconnect: () => observer.disconnect(),
  };
};

import { getFetchFunction } from "@fiftyone/utilities";
import type { TreeNode } from "@voxel51/voodo";
import { useEffect, useState } from "react";

interface TaxonomyResponse {
  taxonomy: {
    name: string;
    type: string;
    version: number;
    root: TreeNode;
  };
}

export interface UseTaxonomyTreeResult {
  tree: TreeNode | null;
  isFetching: boolean;
  error: string | null;
}

export const useTaxonomyTree = (
  name: string | undefined
): UseTaxonomyTreeResult => {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) {
      setTree(null);
      setIsFetching(false);
      setError(null);
      return () => {}; // early return a noop cleanup function to satisfy the linter
    }

    let cancelled = false;
    setIsFetching(true);
    setError(null);

    const path = `/ontologies/${encodeURIComponent(name)}/taxonomy`;
    getFetchFunction()("GET", path)
      .then((result) => {
        if (!cancelled) setTree((result as TaxonomyResponse).taxonomy.root);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setIsFetching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [name]);

  return { tree, isFetching, error };
};

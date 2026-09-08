import { useTaxonomyTree } from "./useTaxonomyTree";
import type { WidgetProps } from "@rjsf/utils";
import {
  FormField,
  TreeSelect,
  type TreeNode,
  type TreePath,
} from "@voxel51/voodo";
import { useCallback, useMemo } from "react";

function buildFallbackTree(names: string[], rootName: string): TreeNode {
  return {
    name: rootName,
    values: names.map((n) => ({ name: n })),
  };
}

function buildLeafNameIndex(root: TreeNode): Map<string, TreePath> {
  const index = new Map<string, TreePath>();

  const walk = (node: TreeNode, path: TreePath) => {
    if (!index.has(node.name)) {
      index.set(node.name, path);
    }
    if (node.values) {
      for (const child of node.values) {
        walk(child, [...path, child.name]);
      }
    }
  };

  if (root.values) {
    for (const child of root.values) {
      walk(child, [root.name, child.name]);
    }
  }

  return index;
}

export default function TaxonomyWidget(props: WidgetProps) {
  const { value, onChange, schema, uiSchema, disabled, readonly, label } =
    props;
  const rawErrors = props.rawErrors ?? [];

  const options = uiSchema?.["ui:options"] ?? {};
  const taxonomy = options.taxonomy as string | undefined;
  const multiSelect = options.multiSelect as boolean | undefined;

  const { tree, isFetching, error: fetchError } = useTaxonomyTree(taxonomy);

  const leafIndex = useMemo(
    () => (tree ? buildLeafNameIndex(tree) : new Map<string, TreePath>()),
    [tree],
  );

  const treeValue = useMemo(() => {
    if (!tree) return multiSelect ? [] : undefined;

    if (multiSelect) {
      const names: string[] = Array.isArray(value) ? value : [];
      return names
        .map((n) => leafIndex.get(n))
        .filter((p): p is TreePath => p != null);
    }

    if (typeof value === "string" && value !== "") {
      return leafIndex.get(value) ?? undefined;
    }
    return undefined;
  }, [tree, value, multiSelect, leafIndex]);

  const handleSingleChange = useCallback(
    (path: TreePath | null) => {
      if (path == null) {
        onChange(undefined);
      } else {
        onChange(path[path.length - 1]);
      }
    },
    [onChange],
  );

  const handleMultiChange = useCallback(
    (paths: TreePath[]) => {
      onChange(paths.map((p) => p[p.length - 1]));
    },
    [onChange],
  );

  // RJSF validation errors take priority. Taxonomy-state errors (missing config,
  // failed fetch) are only relevant in the fallback path when the tree isn't loaded.
  const validationError = rawErrors[0] ?? undefined;
  const taxonomyStateError = !taxonomy
    ? "No taxonomy configured"
    : fetchError
      ? "Failed to load taxonomy"
      : undefined;

  const existingNames = useMemo(() => {
    if (multiSelect && Array.isArray(value)) {
      return value.filter(
        (v): v is string => typeof v === "string" && v !== "",
      );
    }
    if (!multiSelect && typeof value === "string" && value !== "") {
      return [value];
    }
    return [];
  }, [value, multiSelect]);

  // Values to render the TreeSelect component in various states
  let treeRoot: TreeNode;
  let selectValue: TreePath | readonly TreePath[] | undefined;
  let selectDisabled: boolean;
  let displayError: string | undefined;
  let placeholder: string | undefined;
  let handleChange:
    | ((path: TreePath | null) => void)
    | ((paths: TreePath[]) => void)
    | undefined;

  if (!tree) {
    selectDisabled = true;

    if (isFetching) {
      treeRoot = { name: "", values: [] };
      placeholder = "Loading taxonomy...";
      displayError = undefined;
    } else if (existingNames.length > 0) {
      // We use a fallback tree in the case where taxonomy no longer exists, but there are
      // existing values on the field. Since the base TreeSelect component requires a root node,
      // we use a dummy root node with the name "values" and the existing values as children.
      treeRoot = buildFallbackTree(existingNames, taxonomy || "values");
      selectValue = multiSelect
        ? existingNames.map((n) => [treeRoot.name, n] as TreePath)
        : ([treeRoot.name, existingNames[0]] as TreePath);
      displayError = validationError ?? taxonomyStateError;
    } else {
      treeRoot = { name: "", values: [] };
      placeholder = "No taxonomy applied";
      displayError = validationError ?? taxonomyStateError;
    }
  } else {
    treeRoot = tree;
    selectValue = treeValue;
    selectDisabled = !!(disabled || readonly);
    displayError = validationError;
    handleChange = multiSelect ? handleMultiChange : handleSingleChange;
  }

  const treeSelect = multiSelect ? (
    <TreeSelect
      root={treeRoot}
      multiSelect
      value={selectValue as readonly TreePath[] | undefined}
      onChange={handleChange as ((paths: TreePath[]) => void) | undefined}
      disabled={selectDisabled}
      placeholder={placeholder}
      portal
    />
  ) : (
    <TreeSelect
      root={treeRoot}
      value={selectValue as TreePath | undefined}
      onChange={handleChange as ((path: TreePath | null) => void) | undefined}
      disabled={selectDisabled}
      placeholder={placeholder}
      portal
    />
  );

  return (
    <FormField
      label={label || schema.title}
      control={treeSelect}
      error={displayError}
    />
  );
}

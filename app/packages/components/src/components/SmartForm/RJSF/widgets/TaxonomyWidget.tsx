import { useTaxonomyTree } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/SchemaManager/EditFieldLabelSchema/useTaxonomyTree";
import type { WidgetProps } from "@rjsf/utils";
import {
  FormField,
  TreeSelect,
  type TreeNode,
  type TreePath,
} from "@voxel51/voodo";
import { useCallback, useMemo } from "react";

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
    [tree]
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
    [onChange]
  );

  const handleMultiChange = useCallback(
    (paths: TreePath[]) => {
      onChange(paths.map((p) => p[p.length - 1]));
    },
    [onChange]
  );

  const fieldError =
    rawErrors[0] ??
    (fetchError ? `Failed to load taxonomy: ${fetchError}` : undefined);

  if (!tree) {
    return (
      <FormField
        label={label || schema.title}
        control={
          <TreeSelect
            root={{ name: "", values: [] }}
            disabled
            placeholder={isFetching ? "Loading taxonomy..." : "No taxonomy"}
            portal
          />
        }
        error={fieldError}
      />
    );
  }

  if (multiSelect) {
    return (
      <FormField
        label={label || schema.title}
        control={
          <TreeSelect
            root={tree}
            multiSelect
            value={treeValue as readonly TreePath[]}
            onChange={handleMultiChange}
            disabled={disabled || readonly}
            portal
          />
        }
        error={fieldError}
      />
    );
  }

  return (
    <FormField
      label={label || schema.title}
      control={
        <TreeSelect
          root={tree}
          value={treeValue as TreePath | undefined}
          onChange={handleSingleChange}
          disabled={disabled || readonly}
          portal
        />
      }
      error={fieldError}
    />
  );
}

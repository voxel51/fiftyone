import { SpaceNodeJSON, useSpaces } from "@fiftyone/spaces";
import { Space } from "@fiftyone/spaces/src/components";
import React from "react";

/** Layout for <StackedModalSpace>: a `tree` plus a flex `weight` per top-level child. */
export interface StackedModalLayout {
  spacesId: string;
  tree: SpaceNodeJSON;
  weights: number[];
}

/**
 * Generic modal layout: stacks a tree's top-level children vertically at fixed
 * flex `weights` (no resizable split, so the ratio can't drift to 50/50).
 */
export const StackedModalSpace = React.memo(
  ({ spacesId, tree, weights }: StackedModalLayout) => {
    const { spaces } = useSpaces(spacesId, tree);

    // Gate until useSpaces has seeded the tree (async effect).
    if (!spaces.root.hasChildren()) return null;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
        }}
      >
        {spaces.root.children.map((node, i) => (
          <div
            key={node.id}
            style={{ flex: `${weights[i] ?? 1} 1 0`, minHeight: 0 }}
          >
            <Space node={node} id={spacesId} archetype="modal" />
          </div>
        ))}
      </div>
    );
  }
);

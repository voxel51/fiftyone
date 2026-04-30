import { useEffect, useState } from "react";
import { Panel } from "./components";
import SpaceNode from "./SpaceNode";
import { PanelRendererProps } from "./types";

export default function PanelRenderer(props: PanelRendererProps) {
  const { name, id } = props;
  const [node, setNode] = useState<SpaceNode | null>(null);

  useEffect(() => {
    const node = new SpaceNode();
    node.id = id;
    node.type = name;
    setNode(node);
  }, [name, id]);

  if (!node) {
    return null;
  }

  return <Panel node={node} isModalPanel={false} />;
}
